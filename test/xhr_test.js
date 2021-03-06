// Copyright (C) 2007-2013, GoodData(R) Corporation. All rights reserved.
/*eslint func-names: 0, vars-on-top: 0*/
import * as xhr from '../src/xhr';
import $ from 'jquery';
import { setCustomDomain } from '../src/config';

describe('xhr', () => {
    /* $.ajax returns jqXhr object with deferred interface
        this add jqXhr properties according to options to simulate jqXhr
    */
    function fakeJqXhr(options, d) {
        let i;
        for (i = 0; i < d.length; i++) {
            $.extend(d[i], options);
        }
    }

    let d = [];
    let expects = [];

    beforeEach(function() {
        const mock = sinon.mock($);
        let i;
        /** mock result for first three calls of $.ajax */
        for (i = 0; i < 3; i++) {
            /*eslint-disable new-cap*/
            d.push($.Deferred());
            /*eslint-enable new-cap*/
            expects.push(mock.expects('ajax').returns(d[i]));
        }
    });

    afterEach(function() {
        d = [];
        expects = [];
        if ($.ajax.restore) $.ajax.restore();
    });

    function mockResponse(status, headers) {
        return {
            status: status,
            getResponseHeader: function(header) {
                return headers ? headers[header] : null;
            }
        };
    }

    describe('$.ajax request', () => {
        it('should handle successful request', done => {
            xhr.ajax('/some/url').done(function(data, textStatus, xhrObj) {
                expect(expects[0].calledOnce).to.be.ok();
                expect(data).to.be('Hello');
                expect(xhrObj.status).to.be(200);
                done();
            });
            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('/some/url');
            expect(settings.contentType).to.be('application/json');
            d[0].resolve('Hello', '', mockResponse(200));
        });

        it('should stringify JSON data for GDC backend', done => {
            xhr.ajax('/some/url', {
                type: 'post',
                data: { foo: 'bar'}
            }).done(function() {
                done();
            });
            const settings = expects[0].lastCall.args[0];
            expect(settings.data).to.be('{"foo":"bar"}');
            d[0].resolve('Ok', '', mockResponse(200));
        });

        it('should handle unsuccessful request', done => {
            xhr.ajax('/some/url').fail(function(xhrObj) {
                expect(expects[0].calledOnce).to.be.ok();
                expect(xhrObj.status).to.be(404);
                done();
            });
            d[0].reject(mockResponse(404));
        });

        it('should support url in settings', done => {
            xhr.ajax({ url: '/some/url'}).done(function(data, textStatus, xhrObj) {
                expect(expects[0].calledOnce).to.be.ok();
                expect(xhrObj.status).to.be(200);
                done();
            });
            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('/some/url');
            d[0].resolve('Hello', '', mockResponse(200));
        });

        it('should work with sucess callback in settings', done => {
            xhr.ajax({ url: '/some/url', success: function(data, textStatus, xhrObj) {
                expect(data).to.be('Hello');
                expect(xhrObj.status).to.be(200);
                done();
            }});
            d[0].resolve('Hello', '', mockResponse(200));
        });

        it('should work with error callback in settings', done => {
            xhr.ajax({ url: '/some/url', error: function(xhrObj) {
                expect(xhrObj.status, 404);
                done();
            }});
            d[0].reject(mockResponse(404));
        });

        it('should work with complete callback in settings for success', done => {
            xhr.ajax({ url: '/some/url', complete: function() {
                done();
            }});
            d[0].resolve('Hello', '', { status: 200});
        });

        it('should work with complete callback in settings for failure', done => {
            xhr.ajax({ url: '/some/url', complete: function() {
                done();
            }});
            d[0].reject(mockResponse(404));
        });

        it('should have accept header set on application/json', done => {
            xhr.ajax({ url: '/some/url'}).done(function(data, textStatus, xhrObj) {
                expect(expects[0].calledOnce).to.be.ok();
                expect(xhrObj.status).to.be(200);
                done();
            });
            const settings = expects[0].lastCall.args[0];
            expect(settings.headers.Accept).to.be('application/json; charset=utf-8');
            d[0].resolve('Hello', '', mockResponse(200));
        });
    });

    describe('$.ajax unathorized handling', () => {
        it('should renew token when TT expires', done => {
            const options = { url: '/some/url'};
            xhr.ajax(options).done(function(data, textStatus, xhrObj) {
                expect(expects[2].calledOnce).to.be.ok();
                expect(xhrObj.status).to.be(200);
                expect(data).to.be('Hello');
                done();
            });
            fakeJqXhr(options, d);
            d[0].reject(mockResponse(401)); // first request
            d[1].resolve({}, '', mockResponse(200)); // token request
            d[2].resolve('Hello', '', mockResponse(200)); // request retry
        });

        it(
            'should fail if token renewal fails and unathorize handler is not set',
            done => {
                const options = { url: '/some/url'};
                xhr.ajax(options).fail(function(xhrObj) {
                    expect(xhrObj.status).to.be(401);
                    expect(expects[1].calledOnce).to.be.ok();
                    expect(expects[2].notCalled).to.be.ok();
                    done();
                });
                fakeJqXhr(options, d);
                d[0].reject(mockResponse(401)); // first request
                d[1].reject(mockResponse(401)); // token request
            }
        );

        it('should invoke unathorized handler is token request fails', done => {
            const options = {
                url: '/some/url',
                unauthorized: function(xhrObj) {
                    expect(xhrObj.status).to.be(401);
                    expect(expects[1].calledOnce).to.be.ok();
                    expect(expects[2].notCalled).to.be.ok();
                    done();
                }
            };
            fakeJqXhr(options, d);
            xhr.ajax(options);
            d[0].reject(mockResponse(401)); // first request
            d[1].reject(mockResponse(401)); // token request
        });

        it(
            'should correctly handle multiple requests with token request in progress',
            done => {
                const optionsFirst = {
                    url: '/some/url/1'
                };
                const optionsSecond = {
                    url: '/some/url/2'
                };

                $.extend(d[0], optionsFirst);
                $.extend(d[1], optionsSecond);

                xhr.ajax(optionsFirst);
                d[0].reject(mockResponse(401));

                // now, token request should be in progress
                // so this "failure" should continue after
                // token request and should correctly fail
                xhr.ajax(optionsSecond).fail(function(xhrObj) {
                    expect(xhrObj.status).to.be(403);
                    done();
                });

                // simulate token request failed
                d[1].reject(mockResponse(403));
            }
        );
    });

    describe('$.ajax polling', () => {
        it('should retry request after delay', done => {
            const options = {
                url: '/some/url',
                data: {a: 'b'},
                pollDelay: 0
            };
            fakeJqXhr(options, d);
            xhr.ajax(options).done(function(data) {
                expect(data).to.be('OK');
                expect(expects[0].lastCall.args[0].method).to.be('GET');
                expect(expects[0].lastCall.args[0].data).to.be(undefined);
                expect(expects[1].lastCall.args[0].method).to.be('GET');
                expect(expects[2].lastCall.args[0].method).to.be('GET');
                done();
            });
            d[0].resolve(null, '', mockResponse(202));
            d[1].resolve(null, '', mockResponse(202));
            d[2].resolve('OK', '', mockResponse(200));
        });

        it('should not poll if client forbids it', done => {
            const options = {
                url: '/some/url',
                pollDelay: 0,
                dontPollOnResult: true
            };

            fakeJqXhr(options, d);
            xhr.ajax(options).done(function(data) {
                expect(data).to.be('FIRST_RESPONSE');
                expect(expects[0].calledOnce).to.be.ok();
                expect(expects[1].notCalled).to.be.ok();
                expect(expects[2].notCalled).to.be.ok();
                expect(expects[0].lastCall.args[0].method).to.be(undefined);
                done();
            });
            d[0].resolve('FIRST_RESPONSE', '', mockResponse(202));
            d[1].resolve('SECOND_RESPONSE', '', mockResponse(202));
            d[2].resolve('THIRD_RESPONSE', '', mockResponse(200));
        });

        it('should correctly reject after retry 404', done => {
            const options = {
                url: '/some/url',
                pollDelay: 0
            };
            fakeJqXhr(options, d);
            xhr.ajax(options).fail(function(xhrObj) {
                expect(xhrObj.status).to.be(404);
                done();
            });
            d[0].resolve(null, '', mockResponse(202));
            d[1].resolve(null, '', mockResponse(202));
            d[2].reject(mockResponse(404));
        });
    });

    describe('$.ajax polling with different location', () => {
        it('should retry request after delay', done => {
            const options = {
                url: '/some/url',
                pollDelay: 0
            };
            fakeJqXhr(options, d);
            xhr.ajax(options).done(function(data) {
                expect(data).to.be('OK');
                expect(expects[0].lastCall.args[0].method).to.be('GET');
                expect(expects[1].lastCall.args[0].method).to.be('GET');
                expect(expects[2].lastCall.args[0].method).to.be('GET');
                expect(expects[2].lastCall.args[0].url).to.be('/other/url');

                done();
            });
            d[0].resolve(null, '', mockResponse(202, {'Location': '/other/url'}));
            d[1].resolve(null, '', mockResponse(202, {'Location': '/other/url'}));
            d[2].resolve('OK', '', mockResponse(200));
        });

        it('should folow multiple redirects', done => {
            const options = {
                url: '/some/url',
                pollDelay: 0
            };
            fakeJqXhr(options, d);
            xhr.ajax(options).done(function(data) {
                expect(data).to.be('OK');
                expect(expects[2].lastCall.args[0].url).to.be('/other/url2');
                done();
            });
            d[0].resolve(null, '', mockResponse(202, {'Location': '/other/url'}));
            d[1].resolve(null, '', mockResponse(202, {'Location': '/other/url2'}));
            d[2].resolve('OK', '', mockResponse(200));
        });

        it('should correctly reject after retry 404', done => {
            const options = {
                url: '/some/url',
                pollDelay: 0
            };
            fakeJqXhr(options, d);
            xhr.ajax(options).fail(function(xhrObj) {
                expect(xhrObj.status).to.be(404);
                done();
            });
            d[0].resolve(null, '', mockResponse(202, {'Location': '/other/url'}));
            d[1].resolve(null, '', mockResponse(202, {'Location': '/other/url'}));
            d[2].reject(mockResponse(404));
        });
    });

    describe('shortcut methods', () => {
        before(function() {
            sinon.stub(xhr, 'ajax');
        });

        after(function() {
            xhr.ajax.restore();
        });

        beforeEach(function() {
            xhr.ajax.reset();
        });

        it('should call xhr.ajax with get method', () => {
            xhr.get('url', {
                contentType: 'text/csv'
            });

            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('url');
            expect(settings.method).to.be('GET');
            expect(settings.contentType).to.be('text/csv');
        });

        it('should call xhr.ajax with post method', () => {
            const data = { message: 'THIS IS SPARTA!' };

            xhr.post('url', {
                data: data,
                contentType: 'text/csv'
            });

            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('url');
            expect(settings.method).to.be('POST');
            expect(settings.data).to.be(JSON.stringify(data));
            expect(settings.contentType).to.be('text/csv');
        });
    });

    describe('enrichSettingWithCustomDomain', () => {
        it('should not touch settings if no domain set', () => {
            const opts = { url: '/test1' };
            expect(setCustomDomain).withArgs(undefined).to.throwError();
            xhr.ajax(opts);
            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('/test1');
            expect(settings.xhrFields).to.be(undefined);
        });
        it('should add domain before url', () => {
            const opts = { url: '/test1' };
            setCustomDomain('https://domain.tld');
            xhr.ajax(opts);
            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('https://domain.tld/test1');
            expect(settings.xhrFields).to.eql({ withCredentials: true });
        });
        it('should not double domain in settings url', () => {
            const opts = { url: 'https://domain.tld/test1' };
            setCustomDomain('https://domain.tld');
            xhr.ajax(opts);
            const settings = expects[0].lastCall.args[0];
            expect(settings.url).to.be('https://domain.tld/test1');
            expect(settings.xhrFields).to.eql({ withCredentials: true });
        });
    });
});
