/******************************************************************************/
/* Middle class for simple sources
 *
 * Copyright 2012-2016 AOL Inc. All rights reserved.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this Software except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var util           = require('util')
  , wiseSource     = require('./wiseSource.js')
  , iptrie         = require('iptrie')
  , HashTable      = require('hashtable')
  ;

function SimpleSource (api, section) {
  SimpleSource.super_.call(this, api, section);
  var self = this;

  self.column  = +api.getConfig(section, "column", 0);
  self.keyColumn  = api.getConfig(section, "keyColumn", 0);

  self.typeSetting();

  if (self.type === "ip") {
    self.cache = {items: new HashTable(), trie: new iptrie.IPTrie()};
  } else {
    self.cache = new HashTable();
  }
}
util.inherits(SimpleSource, wiseSource);
module.exports = SimpleSource;
//////////////////////////////////////////////////////////////////////////////////
SimpleSource.prototype.dump = function(res) {
  var self = this;
  var cache = self.type === "ip"?self.cache.items:self.cache;
  cache.forEach(function(key, value) {
    var str = "{key: \"" + key + "\", ops:\n" + 
      wiseSource.result2Str(wiseSource.combineResults([self.tagsResult, value])) + "},\n";
    res.write(str);
  });
  res.end();
};
//////////////////////////////////////////////////////////////////////////////////
SimpleSource.prototype.sendResult = function(key, cb) {
  var result = this.type === "ip"?this.cache.trie.find(key):this.cache.get(key);

  // Not found, or found but no extra values to add
  if (!result) {
    return cb(null, undefined);
  }
  if (result.num === 0) {
    return cb(null, this.tagsResult);
  }

  // Found, so combine the two results (per item, and per source)
  var newresult = {num: result.num + this.tagsResult.num, buffer: Buffer.concat([result.buffer, this.tagsResult.buffer])};
  return cb(null, newresult);
};
//////////////////////////////////////////////////////////////////////////////////
SimpleSource.prototype.initSimple = function() {
  var self = this;

  if (!this.type) {
    console.log(this.section, "- ERROR not loading since no type specified in config file");
    return false;
  }

  this.tagsSetting();
  if (!this.formatSetting())
    return false;


  if (this.type === "domain") {
    this.getDomain = function(domain, cb) {
      if (this.cache.get(domain)) {
        return this.sendResult(domain, cb);
      }
      domain = domain.substring(domain.indexOf(".")+1);
      return this.sendResult(domain, cb);
    };
  } else if (this.type === "ip") {
    this.getIp = this.sendResult;
  } else if (this.type === "md5") {
    this.getMd5 = this.sendResult;
  } else if (this.type === "email") {
    this.getEmail = this.sendResult;
  } else {
    console.log(this.section, "- ERROR not loading since unknown type specified in config file", this.type);
    return false;
  }

  this.api.addSource(this.section, this);
  return true;
};
//////////////////////////////////////////////////////////////////////////////////
SimpleSource.prototype.load = function() {
  var self = this;
  var setFunc;
  var newCache;
  var count = 0;
  if (this.type === "ip") {
    newCache = {items: new HashTable(), trie: new iptrie.IPTrie()};
    setFunc  = function(key, value) {
      var parts = key.split("/");
      try {
        newCache.trie.add(parts[0], +parts[1] || 32, value);
      } catch (e) {
        console.log("ERROR adding", self.section, key, e);
      }
      newCache.items.put(key, value);
      count++;
    };
  } else {
    newCache = new HashTable();
    setFunc = function(key, value) {
      newCache.put(key, value);
      count++;
    };
  }
  this.simpleSourceLoad(setFunc, function (err) {
    if (err) {
      console.log("ERROR loading", self.section, err);
      return;
    }
    self.cache = newCache;
    console.log(self.section, "- Done Loading", count, "elements");
  });
};

