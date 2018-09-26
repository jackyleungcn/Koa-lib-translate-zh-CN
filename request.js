
'use strict';

/**
 * Module dependencies.
 */

const URL = require('url').URL;               // URL类，用于将字符解析成URL对象
const net = require('net');                   // 网络库，该上下文只用于获取IP判断
const accepts = require('accepts');           // 获取请求的accepts类型
const contentType = require('content-type');  // 解析Content-Type
const stringify = require('url').format;      // 字符化URL对象
const parse = require('parseurl');            // 解析请求对象，提取url属性
const qs = require('querystring');            // 字符查询
const typeis = require('type-is');            // 判断Content-type类型 
const fresh = require('fresh');               // 判断是否刷新缓存，用于如Etag, Catch-Control, Last-Modified
const only = require('only');                 // 对象字段过滤'白名单'
const util = require('util');                 // 工具类

const IP = Symbol('context#ip');              // IP标识符，用于存储字段

/**
 * Prototype.
 */

module.exports = {

  /**
   * Return request header.
   * 返回请求头
   *
   * @return {Object}
   * @api public
   */

  get header() {
    return this.req.headers;
  },

  /**
   * Set request header.
   * 设置请求头
   *
   * @api public
   */

  set header(val) {
    this.req.headers = val;
  },

  /**
   * Return request header, alias as request.header
   * 返回请求头，是request.header的别名
   *
   * @return {Object}
   * @api public
   */

  get headers() {
    return this.req.headers;
  },

  /**
   * Set request header, alias as request.header
   * 设置请求头，是request.header的别名
   *
   * @api public
   */

  set headers(val) {
    this.req.headers = val;
  },

  /**
   * Get request URL.
   * 获取请求URL
   *
   * @return {String}
   * @api public
   */

  get url() {
    return this.req.url;
  },

  /**
   * Set request URL.
   * 设置请求URL
   *
   * @api public
   */

  set url(val) {
    this.req.url = val;
  },

  /**
   * Get origin of URL.
   * 获取请求域名
   *
   * @return {String}
   * @api public
   */

  get origin() {
    return `${this.protocol}://${this.host}`;
  },

  /**
   * Get full request URL.
   * 获取完整的请求URL
   *
   * @return {String}
   * @api public
   */

  get href() {
    // support: `GET http://example.com/foo`
    if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl;
    return this.origin + this.originalUrl;
  },

  /**
   * Get request method.
   * 获取请求Method
   *
   * @return {String}
   * @api public
   */

  get method() {
    return this.req.method;
  },

  /**
   * Set request method.
   * 设置请求Method
   *
   * @param {String} val
   * @api public
   */

  set method(val) {
    this.req.method = val;
  },

  /**
   * Get request pathname.
   * 获取请求路径
   *
   * @return {String}
   * @api public
   */

  get path() {
    return parse(this.req).pathname;
  },

  /**
   * Set pathname, retaining the query-string when present.
   * 设置请求路径，当提供参数则保存该字符串
   *
   * @param {String} path
   * @api public
   */

  set path(path) {
    const url = parse(this.req);
    if (url.pathname === path) return;

    url.pathname = path;
    url.path = null;

    this.url = stringify(url);
  },

  /**
   * Get parsed query-string.
   * 获取查询参数对象
   *
   * @return {Object}
   * @api public
   */

  get query() {
    const str = this.querystring;
    const c = this._querycache = this._querycache || {};
    return c[str] || (c[str] = qs.parse(str));
  },

  /**
   * Set query-string as an object.
   * 设置查询参数对象
   *
   * @param {Object} obj
   * @api public
   */

  set query(obj) {
    this.querystring = qs.stringify(obj);
  },

  /**
   * Get query string.
   * 获取查询字符
   *
   * @return {String}
   * @api public
   */

  get querystring() {
    if (!this.req) return '';
    return parse(this.req).query || '';
  },

  /**
   * Set querystring.
   * 设置查询字符串
   *
   * @param {String} str
   * @api public
   */

  set querystring(str) {
    const url = parse(this.req);
    if (url.search === `?${str}`) return;

    url.search = str;
    url.path = null;

    this.url = stringify(url);
  },

  /**
   * Get the search string. Same as the querystring
   * except it includes the leading ?.
   * 
   * 获取查询字符串，类似于querystring
   * 除了他包含 ? 字符
   *
   * @return {String}
   * @api public
   */

  get search() {
    if (!this.querystring) return '';
    return `?${this.querystring}`;
  },

  /**
   * Set the search string. Same as
   * request.querystring= but included for ubiquity.
   * 
   * 设置查询字符，等同于
   * request.querystring=
   *
   * @param {String} str
   * @api public
   */

  set search(str) {
    this.querystring = str;
  },

  /**
   * Parse the "Host" header field host
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   * 
   * 解析"Host"的host字段
   * 同时，当代理开启，支持X-Forwarded-Host
   *
   * @return {String} hostname:port
   * @api public
   */

  get host() {
    const proxy = this.app.proxy;
    let host = proxy && this.get('X-Forwarded-Host');
    host = host || this.get('Host');
    if (!host) return '';
    return host.split(/\s*,\s*/)[0];
  },

  /**
   * Parse the "Host" header field hostname
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   * 
   * 解析"Host"的hostname字段
   * 同时，当代理开启，支持X-Forwarded-Host
   *
   * @return {String} hostname
   * @api public
   */

  get hostname() {
    const host = this.host;
    if (!host) return '';
    if ('[' == host[0]) return this.URL.hostname || ''; // IPv6
    return host.split(':')[0];
  },

  /**
   * Get WHATWG parsed URL.
   * Lazily memoized.
   * 
   * 获取网页超文本应用技术工作小组标准的URL
   * 懒记录（被记录过一次后，即使URL有变化，也不再赋值）
   *
   * @return {URL|Object}
   * @api public
   */

  get URL() {
    /* istanbul ignore else */
    if (!this.memoizedURL) {
      const protocol = this.protocol;
      const host = this.host;
      const originalUrl = this.originalUrl || ''; // avoid undefined in template string
      try {
        this.memoizedURL = new URL(`${protocol}://${host}${originalUrl}`);
      } catch (err) {
        this.memoizedURL = Object.create(null);
      }
    }
    return this.memoizedURL;
  },

  /**
   * Check if the request is fresh, aka
   * Last-Modified and/or the ETag
   * still match.
   * 
   * 检查请求是否已刷新
   * 根据Last-Modified and/or the ETag
   * 是否仍符合要求
   *
   * @return {Boolean}
   * @api public
   */

  get fresh() {
    const method = this.method;
    const s = this.ctx.status;

    // GET or HEAD for weak freshness validation only
    if ('GET' != method && 'HEAD' != method) return false;

    // 2xx or 304 as per rfc2616 14.26
    if ((s >= 200 && s < 300) || 304 == s) {
      return fresh(this.header, this.response.header);
    }

    return false;
  },

  /**
   * Check if the request is stale, aka
   * "Last-Modified" and / or the "ETag" for the
   * resource has changed.
   * 
   * 检查请求是否已经老旧了
   * 根据Last-Modified and/or the ETag
   * 资源是否已修改
   *
   * @return {Boolean}
   * @api public
   */

  get stale() {
    return !this.fresh;
  },

  /**
   * Check if the request is idempotent.
   * 检查请求的幂等（取反再置为Boolean）
   *
   * @return {Boolean}
   * @api public
   */

  get idempotent() {
    const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
    return !!~methods.indexOf(this.method);
  },

  /**
   * Return the request socket.
   * 返回socket请求
   *
   * @return {Connection}
   * @api public
   */

  get socket() {
    return this.req.socket;
  },

  /**
   * Get the charset when present or undefined.
   * 获取charset
   *
   * @return {String}
   * @api public
   */

  get charset() {
    let type = this.get('Content-Type');
    if (!type) return '';

    try {
      type = contentType.parse(type);
    } catch (e) {
      return '';
    }

    return type.parameters.charset || '';
  },

  /**
   * Return parsed Content-Length when present.
   * 返回Content-Length
   *
   * @return {Number}
   * @api public
   */

  get length() {
    const len = this.get('Content-Length');
    if (len == '') return;
    return ~~len;
  },

  /**
   * Return the protocol string "http" or "https"
   * when requested with TLS. When the proxy setting
   * is enabled the "X-Forwarded-Proto" header
   * field will be trusted. If you're running behind
   * a reverse proxy that supplies https for you this
   * may be enabled.
   * 
   * 返回协议字符串 "http" 或 当请求包含TLS则为 "https"
   * 当代理设置允许 "X-Forwarded-Proto" 字段将被信任
   * 如果你使用反向代理，那么请设置https是被允许的
   *
   * @return {String}
   * @api public
   */

  get protocol() {
    if (this.socket.encrypted) return 'https';
    if (!this.app.proxy) return 'http';
    const proto = this.get('X-Forwarded-Proto');
    return proto ? proto.split(/\s*,\s*/)[0] : 'http';
  },

  /**
   * Short-hand for:
   * 
   * 使用 == 判断请求是否为https
   *
   *    this.protocol == 'https'
   *
   * @return {Boolean}
   * @api public
   */

  get secure() {
    return 'https' == this.protocol;
  },

  /**
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list.
   *
   * For example if the value were "client, proxy1, proxy2"
   * you would receive the array `["client", "proxy1", "proxy2"]`
   * where "proxy2" is the furthest down-stream.
   * 
   * 当 `app.proxy` 为 `true`，解析
   * "X-Forwarded-For" 的IP地址列表
   * 
   * 例如，当value为 "client, proxy1, proxy2"
   * 你将获取到的数组为 `["client", "proxy1", "proxy2"]`
   * 条件是"proxy2"为最后的流
   *
   * @return {Array}
   * @api public
   */

  get ips() {
    const proxy = this.app.proxy;
    const val = this.get('X-Forwarded-For');
    return proxy && val
      ? val.split(/\s*,\s*/)
      : [];
  },

  /**
   * Return request's remote address
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list and return the first one
   * 
   * 返回请求IP地址
   * 当 `app.proxy` 为 `true`，解析
   * "X-Forwarded-For" 为IP地址列表并获取第一个元素
   *
   * @return {String}
   * @api public
   */

  get ip() {
    if (!this[IP]) {
      this[IP] = this.ips[0] || this.socket.remoteAddress || '';
    }
    return this[IP];
  },

  set ip(_ip) {
    this[IP] = _ip;
  },

  /**
   * Return subdomains as an array.
   *
   * Subdomains are the dot-separated parts of the host before the main domain
   * of the app. By default, the domain of the app is assumed to be the last two
   * parts of the host. This can be changed by setting `app.subdomainOffset`.
   *
   * For example, if the domain is "tobi.ferrets.example.com":
   * If `app.subdomainOffset` is not set, this.subdomains is
   * `["ferrets", "tobi"]`.
   * If `app.subdomainOffset` is 3, this.subdomains is `["tobi"]`.
   * 
   * 获取子域名，这是一个数组
   * 子域名是网页host以点分割而成
   * 默认情况下，网页域名最后两个部门为host。这是可以通过`app.subdomainOffset`修改设置的
   * 
   * 例如，当域名为 "tobi.ferrets.example.com"：
   * 如果 `app.subdomainOffset` 没被设置，则subdomains为
   * `["ferrets", "tobi"]`
   * 如果 `app.subdomainOffset` 设置为3，则subdomains为`["tobi"]`
   *
   * @return {Array}
   * @api public
   */

  get subdomains() {
    const offset = this.app.subdomainOffset;
    const hostname = this.hostname;
    if (net.isIP(hostname)) return [];
    return hostname
      .split('.')
      .reverse()
      .slice(offset);
  },

  /**
   * Get accept object.
   * Lazily memoized.
   * 
   * 获取accept对象
   * 懒记录（被记录过一次后，即使URL有变化，也不再赋值）
   *
   * @return {Object}
   * @api private
   */
  get accept() {
    return this._accept || (this._accept = accepts(this.req));
  },

  /**
   * Set accept object.
   * 设置accept对象
   *
   * @param {Object}
   * @api private
   */
  set accept(obj) {
    return this._accept = obj;
  },

  /**
   * Check if the given `type(s)` is acceptable, returning
   * the best match when true, otherwise `false`, in which
   * case you should respond with 406 "Not Acceptable".
   *
   * The `type` value may be a single mime type string
   * such as "application/json", the extension name
   * such as "json" or an array `["json", "html", "text/plain"]`. When a list
   * or array is given the _best_ match, if any is returned.
   * 
   * 检查输入的 `type(s)` 是否允许并返回
   * 最合适的为true，否则为 `false`，在这
   * 情况下你应该响应406 "Not Acceptable"
   * 
   * 这 `type` 的值可以是单一的mine type字符串
   * 例如 "application/json"，扩展名
   * 例如 "json" 或一个数组 `["json", "html", "text/plain"]`。 当一个列表
   * 或数组有符合的元素，该元素会被返回。否则返回false
   * 
   *
   * Examples:
   *
   *     // Accept: text/html
   *     this.accepts('html');
   *     // => "html"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('html');
   *     // => "html"
   *     this.accepts('text/html');
   *     // => "text/html"
   *     this.accepts('json', 'text');
   *     // => "json"
   *     this.accepts('application/json');
   *     // => "application/json"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('image/png');
   *     this.accepts('png');
   *     // => false
   *
   *     // Accept: text/*;q=.5, application/json
   *     this.accepts(['html', 'json']);
   *     this.accepts('html', 'json');
   *     // => "json"
   *
   * @param {String|Array} type(s)...
   * @return {String|Array|false}
   * @api public
   */

  accepts(...args) {
    return this.accept.types(...args);
  },

  /**
   * Return accepted encodings or best fit based on `encodings`.
   *
   * Given `Accept-Encoding: gzip, deflate`
   * an array sorted by quality is returned:
   * 
   *     ['gzip', 'deflate']
   * 
   * 返回accepted encodings 或 基于 `encodings` 的最佳选择
   * 
   * 如输入 `Accept-Encoding: gzip, deflate`
   * 返回一个根据压缩效率排序的有序数组
   * 
   *     ['gzip', 'deflate']
   *
   * @param {String|Array} encoding(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsEncodings(...args) {
    return this.accept.encodings(...args);
  },

  /**
   * Return accepted charsets or best fit based on `charsets`.
   *
   * Given `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
   * an array sorted by quality is returned:
   *
   *     ['utf-8', 'utf-7', 'iso-8859-1']
   * 
   * 返回 accepted charsets 或 基于 `charsets` 的最佳选择
   * 
   * 如输入 `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
   * 返回一个根据字符集版本排序的有序数组
   * 
   *     ['utf-8', 'utf-7', 'iso-8859-1']
   *
   * @param {String|Array} charset(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsCharsets(...args) {
    return this.accept.charsets(...args);
  },

  /**
   * Return accepted languages or best fit based on `langs`.
   *
   * Given `Accept-Language: en;q=0.8, es, pt`
   * an array sorted by quality is returned:
   *
   *     ['es', 'pt', 'en']
   * 
   * 返回 accepted languages 或 基于 `langs` 的最佳选择
   * 
   * 如输入 `Accept-Language: en;q=0.8, es, pt`
   * 返回一个根据语言使用率排序的有序数组
   *
   * @param {String|Array} lang(s)...
   * @return {Array|String}
   * @api public
   */

  acceptsLanguages(...args) {
    return this.accept.languages(...args);
  },

  /**
   * Check if the incoming request contains the "Content-Type"
   * header field, and it contains any of the give mime `type`s.
   * If there is no request body, `null` is returned.
   * If there is no content type, `false` is returned.
   * Otherwise, it returns the first `type` that matches.
   * 
   * 检查请求的"Content-Type"请求头字段，包括任何的mine `type` s
   * 如果没有request body，返回 `null`
   * 如果没有content type，返回 `false`
   * 其他情况，返回第一个符合的 `type`
   * 
   *
   * Examples:
   *
   *     // With Content-Type: text/html; charset=utf-8
   *     this.is('html'); // => 'html'
   *     this.is('text/html'); // => 'text/html'
   *     this.is('text/*', 'application/json'); // => 'text/html'
   *
   *     // When Content-Type is application/json
   *     this.is('json', 'urlencoded'); // => 'json'
   *     this.is('application/json'); // => 'application/json'
   *     this.is('html', 'application/*'); // => 'application/json'
   *
   *     this.is('html'); // => false
   *
   * @param {String|Array} types...
   * @return {String|false|null}
   * @api public
   */

  is(types) {
    if (!types) return typeis(this.req);
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(this.req, types);
  },

  /**
   * Return the request mime type void of
   * parameters such as "charset".
   * 
   * 返回请求mime type
   * 空参返回 "charset"
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
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   * 
   * 返回请求头信息
   * 
   * `Referrer` 头部参数是特殊例子
   * 同时 `Referrer` 和 `Referer` 是等价的
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   *     this.get('Something');
   *     // => ''
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    const req = this.req;
    switch (field = field.toLowerCase()) {
      case 'referer':
      case 'referrer':
        return req.headers.referrer || req.headers.referer || '';
      default:
        return req.headers[field] || '';
    }
  },

  /**
   * Inspect implementation.
   * 对象观察实现
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    if (!this.req) return;
    return this.toJSON();
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
      'method',
      'url',
      'header'
    ]);
  }
};

/**
 * Custom inspection implementation for newer Node.js versions.
 * 对象自定义观察实现
 *
 * @return {Object}
 * @api public
 */

/* istanbul ignore else */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect;
}
