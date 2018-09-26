
'use strict';

/**
 * Module dependencies.
 */

const contentDisposition = require('content-disposition');  // 上传/下载 HTTP文件
const ensureErrorHandler = require('error-inject');         // 错误注入流 
const getType = require('cache-content-type');              // 获取Content-type
const onFinish = require('on-finished');                    // 当HTTP请求关闭，出错，结束时。执行回调
const isJSON = require('koa-is-json');                      // 是否为JSON数据
const escape = require('escape-html');                      // 编码 ", ', &, <, and >.
const typeis = require('type-is').is;                       // 判断Content-type类型           
const statuses = require('statuses');                       // 输出HTTP状态类型
const destroy = require('destroy');                         // 关闭流
const assert = require('assert');                           // 写测试用例
const extname = require('path').extname;                    // 获取文件扩展名
const vary = require('vary');                               // 设置操作HTTP vary响应头部信息
const only = require('only');                               // 对象字段过滤'白名单'
const util = require('util');                               // 工具类，上下文只用到 util.inspect.custom 来查看对象

/**
 * Prototype.
 */

module.exports = {

  /**
   * Return the request socket.
   * 返回Socket请求
   *
   * @return {Connection}
   * @api public
   */

  get socket() {
    return this.res.socket;
  },

  /**
   * Return response header.
   * 返回响应头
   *
   * @return {Object}
   * @api public
   */

  get header() {
    const { res } = this;
    return typeof res.getHeaders === 'function'
      ? res.getHeaders()
      : res._headers || {};  // Node < 7.7
  },

  /**
   * Return response header, alias as response.header
   * 返回响应头，是response.header的别名
   *
   * @return {Object}
   * @api public
   */

  get headers() {
    return this.header;
  },

  /**
   * Get response status code.
   * 获取响应状态码
   *
   * @return {Number}
   * @api public
   */

  get status() {
    return this.res.statusCode;
  },

  /**
   * Set response status code.
   * 设置响应状态码
   *
   * @param {Number} code
   * @api public
   */

  set status(code) {
    if (this.headerSent) return;

    assert('number' == typeof code, 'status code must be a number');
    assert(statuses[code], `invalid status code: ${code}`);
    this._explicitStatus = true;
    this.res.statusCode = code;
    if (this.req.httpVersionMajor < 2) this.res.statusMessage = statuses[code];
    if (this.body && statuses.empty[code]) this.body = null;
  },

  /**
   * Get response status message
   * 获取响应状态消息
   *
   * @return {String}
   * @api public
   */

  get message() {
    return this.res.statusMessage || statuses[this.status];
  },

  /**
   * Set response status message
   * 设置响应状态消息
   *
   * @param {String} msg
   * @api public
   */

  set message(msg) {
    this.res.statusMessage = msg;
  },

  /**
   * Get response body.
   * 获取响应body
   *
   * @return {Mixed}
   * @api public
   */

  get body() {
    return this._body;
  },

  /**
   * Set response body.
   * 设置响应body
   *
   * @param {String|Buffer|Object|Stream} val
   * @api public
   */

  set body(val) {
    const original = this._body;
    this._body = val;

    // no content
    if (null == val) {
      if (!statuses.empty[this.status]) this.status = 204;
      this.remove('Content-Type');
      this.remove('Content-Length');
      this.remove('Transfer-Encoding');
      return;
    }

    // set the status
    if (!this._explicitStatus) this.status = 200;

    // set the content-type only if not yet set
    const setType = !this.header['content-type'];

    // string
    if ('string' == typeof val) {
      if (setType) this.type = /^\s*</.test(val) ? 'html' : 'text';
      this.length = Buffer.byteLength(val);
      return;
    }

    // buffer
    if (Buffer.isBuffer(val)) {
      if (setType) this.type = 'bin';
      this.length = val.length;
      return;
    }

    // stream
    if ('function' == typeof val.pipe) {
      onFinish(this.res, destroy.bind(null, val));
      ensureErrorHandler(val, err => this.ctx.onerror(err));

      // overwriting
      if (null != original && original != val) this.remove('Content-Length');

      if (setType) this.type = 'bin';
      return;
    }

    // json
    this.remove('Content-Length');
    this.type = 'json';
  },

  /**
   * Set Content-Length field to `n`.
   * 设置Content-Length字段为 `n`
   *
   * @param {Number} n
   * @api public
   */

  set length(n) {
    this.set('Content-Length', n);
  },

  /**
   * Return parsed response Content-Length when present.
   * 返回当前响应的Content-Length长度
   *
   * @return {Number}
   * @api public
   */

  get length() {
    const len = this.header['content-length'];
    const body = this.body;

    if (null == len) {
      if (!body) return;
      if ('string' == typeof body) return Buffer.byteLength(body);
      if (Buffer.isBuffer(body)) return body.length;
      if (isJSON(body)) return Buffer.byteLength(JSON.stringify(body));
      return;
    }

    return ~~len;
  },

  /**
   * Check if a header has been written to the socket.
   * 判断响应头是否已经被发送
   *
   * @return {Boolean}
   * @api public
   */

  get headerSent() {
    return this.res.headersSent;
  },

  /**
   * Vary on `field`.
   * 设置响应头信息
   *
   * @param {String} field
   * @api public
   */

  vary(field) {
    if (this.headerSent) return;

    vary(this.res, field);
  },

  /**
   * Perform a 302 redirect to `url`.
   *
   * The string "back" is special-cased
   * to provide Referrer support, when Referrer
   * is not present `alt` or "/" is used.
   * 
   * 执行302跳转到 `url`
   * 字符 "back" 是特殊例子
   * 提供Referrer支持，当Referrer
   * 没被声明， `alt` 或 "/" 会被使用
   *
   * Examples:
   *
   *    this.redirect('back');
   *    this.redirect('back', '/index.html');
   *    this.redirect('/login');
   *    this.redirect('http://google.com');
   *
   * @param {String} url
   * @param {String} [alt]
   * @api public
   */

  redirect(url, alt) {
    // location
    if ('back' == url) url = this.ctx.get('Referrer') || alt || '/';
    this.set('Location', url);

    // status
    if (!statuses.redirect[this.status]) this.status = 302;

    // html
    if (this.ctx.accepts('html')) {
      url = escape(url);
      this.type = 'text/html; charset=utf-8';
      this.body = `Redirecting to <a href="${url}">${url}</a>.`;
      return;
    }

    // text
    this.type = 'text/plain; charset=utf-8';
    this.body = `Redirecting to ${url}.`;
  },

  /**
   * Set Content-Disposition header to "attachment" with optional `filename`.
   * 设置Content-Disposition为attachment，带上filename字段（供告知客户端下载使用）
   *
   * @param {String} filename
   * @api public
   */

  attachment(filename) {
    if (filename) this.type = extname(filename);
    this.set('Content-Disposition', contentDisposition(filename));
  },

  /**
   * Set Content-Type response header with `type` through `mime.lookup()`
   * when it does not contain a charset.
   * 
   * 通过 `mime.lookup()` 设置Content-Type响应头的 `type`
   * 当没有包含字符集
   *
   * Examples:
   *
   *     this.type = '.html';
   *     this.type = 'html';
   *     this.type = 'json';
   *     this.type = 'application/json';
   *     this.type = 'png';
   *
   * @param {String} type
   * @api public
   */

  set type(type) {
    type = getType(type);
    if (type) {
      this.set('Content-Type', type);
    } else {
      this.remove('Content-Type');
    }
  },

  /**
   * Set the Last-Modified date using a string or a Date.
   * 设置Last-Modified日期，使用字符串或日期对象
   *
   *     this.response.lastModified = new Date();
   *     this.response.lastModified = '2013-09-13';
   *
   * @param {String|Date} type
   * @api public
   */

  set lastModified(val) {
    if ('string' == typeof val) val = new Date(val);
    this.set('Last-Modified', val.toUTCString());
  },

  /**
   * Get the Last-Modified date in Date form, if it exists.
   * 如果Last-Modified字段存在，获取其日期对象
   *
   * @return {Date}
   * @api public
   */

  get lastModified() {
    const date = this.get('last-modified');
    if (date) return new Date(date);
  },

  /**
   * Set the ETag of a response.
   * This will normalize the quotes if necessary.
   * 
   * 设置响应Etag
   * 如有必要会使引号正常化
   *
   *     this.response.etag = 'md5hashsum';
   *     this.response.etag = '"md5hashsum"';
   *     this.response.etag = 'W/"123456789"';
   *
   * @param {String} etag
   * @api public
   */

  set etag(val) {
    if (!/^(W\/)?"/.test(val)) val = `"${val}"`;
    this.set('ETag', val);
  },

  /**
   * Get the ETag of a response.
   * 获取响应ETag
   *
   * @return {String}
   * @api public
   */

  get etag() {
    return this.get('ETag');
  },

  /**
   * Return the response mime type void of
   * parameters such as "charset".
   * 
   * 返回响应mine type的无效参数
   * 如 "charset"
   *
   * @return {String}
   * @api public
   */

  get type() {
    const type = this.get('Content-Type');
    if (!type) return '';
    return type.split(';')[0];
  },

  /**
   * Check whether the response is one of the listed types.
   * Pretty much the same as `this.request.is()`.
   * 
   * 检查响应是否在类型列表中
   * 类似于 `this.request.is()`
   *
   * @param {String|Array} types...
   * @return {String|false}
   * @api public
   */

  is(types) {
    const type = this.type;
    if (!types) return type || false;
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(type, types);
  },

  /**
   * Return response header.
   * 返回响应头（带参获取）
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    return this.header[field.toLowerCase()] || '';
  },

  /**
   * Set header `field` to `val`, or pass
   * an object of header fields.
   * 
   * 设置响应头字段 `field` 为 `val`
   * 传入对象则将其属性设置为请求头字段
   *
   * Examples:
   *
   *    this.set('Foo', ['bar', 'baz']);
   *    this.set('Accept', 'application/json');
   *    this.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
   *
   * @param {String|Object|Array} field
   * @param {String} val
   * @api public
   */

  set(field, val) {
    if (this.headerSent) return;

    if (2 == arguments.length) {
      if (Array.isArray(val)) val = val.map(v => typeof v === 'string' ? v : String(v));
      else if (typeof val !== 'string') val = String(val);
      this.res.setHeader(field, val);
    } else {
      for (const key in field) {
        this.set(key, field[key]);
      }
    }
  },

  /**
   * Append additional header `field` with value `val`.
   * 添加额外的响应头字段
   *
   * Examples:
   *
   * ```
   * this.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
   * this.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
   * this.append('Warning', '199 Miscellaneous warning');
   * ```
   *
   * @param {String} field
   * @param {String|Array} val
   * @api public
   */

  append(field, val) {
    const prev = this.get(field);

    if (prev) {
      val = Array.isArray(prev)
        ? prev.concat(val)
        : [prev].concat(val);
    }

    return this.set(field, val);
  },

  /**
   * Remove header `field`.
   * 删除头部字段
   *
   * @param {String} name
   * @api public
   */

  remove(field) {
    if (this.headerSent) return;

    this.res.removeHeader(field);
  },

  /**
   * Checks if the request is writable.
   * Tests for the existence of the socket
   * as node sometimes does not set it.
   * 
   * 检查响应是否可写
   * 用于测试socket实例
   * 在node有时不被设置
   *
   * @return {Boolean}
   * @api private
   */

  get writable() {
    // can't write any more after response finished
    if (this.res.finished) return false;

    const socket = this.res.socket;
    // There are already pending outgoing res, but still writable
    // https://github.com/nodejs/node/blob/v4.4.7/lib/_http_server.js#L486
    if (!socket) return true;
    return socket.writable;
  },

  /**
   * Inspect implementation.
   * 对象观察实现
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    if (!this.res) return;
    const o = this.toJSON();
    o.body = this.body;
    return o;
  },

  /**
   * Return JSON representation.
   * 返回JSON白名单
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, [
      'status',
      'message',
      'header'
    ]);
  },

  /**
   * Flush any set headers, and begin the body
   * 刷新所有的header设置，从body部分开始
   */
  flushHeaders() {
    this.res.flushHeaders();
  }
};

/**
 * Custom inspection implementation for newer Node.js versions.
 * 对象自定义观察实现
 *
 * @return {Object}
 * @api public
 */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect;
}
