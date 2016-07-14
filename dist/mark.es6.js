/*!***************************************************
 * mark.js v8.0.0
 * https://github.com/julmot/mark.js
 * Copyright (c) 2014–2016, Julian Motz
 * Released under the MIT license https://git.io/vwTVl
 *****************************************************/

"use strict";

((factory, window, document) => {
    if (typeof define === "function" && define.amd) {
        define([], () => {
            return factory(window, document);
        });
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory(window, document);
    } else {
        factory(window, document);
    }
})((window, document) => {
    class Mark {
        constructor(ctx) {
            this.ctx = ctx;
        }

        set opt(val) {
            this._opt = Object.assign({}, {
                "element": "",
                "className": "",
                "exclude": [],
                "iframes": false,
                "separateWordSearch": true,
                "diacritics": true,
                "synonyms": {},
                "accuracy": "partially",
                "each": () => {},
                "noMatch": () => {},
                "filter": () => true,
                "done": () => {},
                "debug": false,
                "log": window.console
            }, val);
        }

        get opt() {
            return this._opt;
        }

        log(msg, level = "debug") {
            const log = this.opt.log;
            if (!this.opt.debug) {
                return;
            }
            if (typeof log === "object" && typeof log[level] === "function") {
                log[level](`mark.js: ${ msg }`);
            }
        }

        escapeStr(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        }

        createRegExp(str) {
            str = this.escapeStr(str);
            if (Object.keys(this.opt.synonyms).length) {
                str = this.createSynonymsRegExp(str);
            }
            if (this.opt.diacritics) {
                str = this.createDiacriticsRegExp(str);
            }
            str = this.createMergedBlanksRegExp(str);
            str = this.createAccuracyRegExp(str);
            return str;
        }

        createSynonymsRegExp(str) {
            const syn = this.opt.synonyms;
            for (let index in syn) {
                if (syn.hasOwnProperty(index)) {
                    const value = syn[index],
                          k1 = this.escapeStr(index),
                          k2 = this.escapeStr(value);
                    str = str.replace(new RegExp(`(${ k1 }|${ k2 })`, "gmi"), `(${ k1 }|${ k2 })`);
                }
            }
            return str;
        }

        createDiacriticsRegExp(str) {
            const dct = ["aÀÁÂÃÄÅàáâãäåĀāąĄ", "cÇçćĆčČ", "dđĐďĎ", "eÈÉÊËèéêëěĚĒēęĘ", "iÌÍÎÏìíîïĪī", "lłŁ", "nÑñňŇńŃ", "oÒÓÔÕÕÖØòóôõöøŌō", "rřŘ", "sŠšśŚ", "tťŤ", "uÙÚÛÜùúûüůŮŪū", "yŸÿýÝ", "zŽžżŻźŹ"];
            let handled = [];
            str.split("").forEach(ch => {
                dct.every(dct => {
                    if (dct.indexOf(ch) !== -1) {
                        if (handled.indexOf(dct) > -1) {
                            return false;
                        }

                        str = str.replace(new RegExp(`[${ dct }]`, "gmi"), `[${ dct }]`);
                        handled.push(dct);
                    }
                    return true;
                });
            });
            return str;
        }

        createMergedBlanksRegExp(str) {
            return str.replace(/[\s]+/gmi, "[\\s]*");
        }

        createAccuracyRegExp(str) {
            let acc = this.opt.accuracy,
                val = typeof acc === "string" ? acc : acc.value,
                ls = typeof acc === "string" ? [] : acc.limiters,
                lsJoin = "";
            ls.forEach(limiter => {
                lsJoin += `|${ this.escapeStr(limiter) }`;
            });
            switch (val) {
                case "partially":
                    return `()(${ str })`;
                case "complementary":
                    return `()([^\\s${ lsJoin }]*${ str }[^\\s${ lsJoin }]*)`;
                case "exactly":
                    return `(^|\\s${ lsJoin })(${ str })(?=$|\\s${ lsJoin })`;
            }
        }

        getSeparatedKeywords(sv) {
            let stack = [];
            sv.forEach(kw => {
                if (!this.opt.separateWordSearch) {
                    if (kw.trim()) {
                        stack.push(kw);
                    }
                } else {
                    kw.split(" ").forEach(kwSplitted => {
                        if (kwSplitted.trim()) {
                            stack.push(kwSplitted);
                        }
                    });
                }
            });
            return {
                "keywords": stack,
                "length": stack.length
            };
        }

        getContexts() {
            let ctx;
            if (typeof this.ctx === "undefined") {
                ctx = [];
            } else if (this.ctx instanceof HTMLElement) {
                ctx = [this.ctx];
            } else if (Array.isArray(this.ctx)) {
                ctx = this.ctx;
            } else {
                ctx = Array.prototype.slice.call(this.ctx);
            }
            if (!ctx.length) {
                this.log("Empty context", "warn");
            }
            return ctx;
        }

        matches(el, selector) {
            return (el.matches || el.matchesSelector || el.msMatchesSelector || el.mozMatchesSelector || el.webkitMatchesSelector || el.oMatchesSelector).call(el, selector);
        }

        matchesExclude(el, exclM) {
            let remain = true;
            let excl = this.opt.exclude.concat(["script", "style", "title"]);
            if (exclM) {
                excl = excl.concat(["*[data-markjs='true']"]);
            }
            excl.every(sel => {
                if (this.matches(el, sel)) {
                    return remain = false;
                }
                return true;
            });
            return !remain;
        }

        onIframeReady(ifr, successFn, errorFn) {
            try {
                const ifrWin = ifr.contentWindow,
                      bl = "about:blank",
                      compl = "complete";
                const callCallback = () => {
                    try {
                        if (ifrWin.document === null) {
                            throw new Error("iframe inaccessible");
                        }
                        successFn(ifrWin.document);
                    } catch (e) {
                        errorFn();
                    }
                };
                const isBlank = () => {
                    const src = ifr.getAttribute("src").trim(),
                          href = ifrWin.location.href;
                    return href === bl && src !== bl && src;
                };
                const observeOnload = () => {
                    const listener = () => {
                        try {
                            if (!isBlank()) {
                                ifr.removeEventListener("load", listener);
                                callCallback();
                            }
                        } catch (e) {
                            errorFn();
                        }
                    };
                    ifr.addEventListener("load", listener);
                };
                if (ifrWin.document.readyState === compl) {
                    if (isBlank()) {
                        observeOnload();
                    } else {
                        callCallback();
                    }
                } else {
                    observeOnload();
                }
            } catch (e) {
                errorFn();
            }
        }

        forEachIframe(ctx, cb, end) {
            let ifr = ctx.querySelectorAll("iframe");
            ifr = Array.prototype.slice.call(ifr);
            if (ifr.length) {
                ifr.forEach(ifr => {
                    this.onIframeReady(ifr, con => {
                        const html = con.querySelector("html");
                        this.forEachIframe(html, cb, () => {
                            cb(html);
                            end();
                        });
                    }, () => {
                        const src = ifr.getAttribute("src");
                        this.log(`iframe "${ src }" could not be accessed`, "warn");
                        end();
                    });
                });
            } else {
                end();
            }
        }

        forEachContext(cb, end) {
            const ctx = this.getContexts(),
                  callCallbacks = el => {
                cb(el);
                if (--open < 1) {
                    end();
                }
            };
            let open = ctx.length;
            if (open < 1) {
                end();
            }
            ctx.forEach(el => {
                if (this.opt.iframes) {
                    this.forEachIframe(el, cb, () => {
                        callCallbacks(el);
                    });
                } else {
                    callCallbacks(el);
                }
            });
        }

        forEachTextNode(cb, end) {
            let handled = [];
            this.forEachContext(ctx => {
                const isDescendant = handled.filter(handledCtx => {
                    return handledCtx.contains(ctx);
                }).length > 0;
                if (handled.indexOf(ctx) > -1 || isDescendant) {
                    return;
                }
                handled.push(ctx);
                const itr = document.createNodeIterator(ctx, NodeFilter.SHOW_TEXT, node => {
                    if (!this.matchesExclude(node.parentNode, true)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }, false);
                let node;
                while (node = itr.nextNode()) {
                    cb(node);
                }
            }, end);
        }

        wrapMatches(node, regex, custom, filterCb, eachCb) {
            const hEl = !this.opt.element ? "mark" : this.opt.element,
                  index = custom ? 0 : 2;
            let match;
            while ((match = regex.exec(node.textContent)) !== null) {
                if (!filterCb(match[index])) {
                    continue;
                }

                let pos = match.index;
                if (!custom) {
                    pos += match[index - 1].length;
                }
                let startNode = node.splitText(pos);

                node = startNode.splitText(match[index].length);
                if (startNode.parentNode !== null) {
                    let repl = document.createElement(hEl);
                    repl.setAttribute("data-markjs", "true");
                    if (this.opt.className) {
                        repl.setAttribute("class", this.opt.className);
                    }
                    repl.textContent = match[index];
                    startNode.parentNode.replaceChild(repl, startNode);
                    eachCb(repl);
                }
                regex.lastIndex = 0;
            }
        }

        unwrapMatches(node) {
            const parent = node.parentNode;
            let docFrag = document.createDocumentFragment();
            while (node.firstChild) {
                docFrag.appendChild(node.removeChild(node.firstChild));
            }
            parent.replaceChild(docFrag, node);
            parent.normalize();
        }

        markRegExp(regexp, opt) {
            this.opt = opt;
            this.log(`Searching with expression "${ regexp }"`);
            let totalMatches = 0;
            const eachCb = element => {
                totalMatches++;
                this.opt.each(element);
            };
            this.forEachTextNode(node => {
                this.wrapMatches(node, regexp, true, match => {
                    return this.opt.filter(node, match, totalMatches);
                }, eachCb);
            }, () => {
                if (totalMatches === 0) {
                    this.opt.noMatch(regexp);
                }
                this.opt.done(totalMatches);
            });
        }

        mark(sv, opt) {
            this.opt = opt;
            const {
                keywords: kwArr,
                length: kwArrLen
            } = this.getSeparatedKeywords(typeof sv === "string" ? [sv] : sv);
            let totalMatches = 0;
            if (kwArrLen === 0) {
                this.opt.done(totalMatches);
            }
            kwArr.forEach(kw => {
                let regex = new RegExp(this.createRegExp(kw), "gmi"),
                    matches = 0;
                const eachCb = element => {
                    matches++;
                    totalMatches++;
                    this.opt.each(element);
                };
                this.log(`Searching with expression "${ regex }"`);
                this.forEachTextNode(node => {
                    this.wrapMatches(node, regex, false, () => {
                        return this.opt.filter(node, kw, matches, totalMatches);
                    }, eachCb);
                }, () => {
                    if (matches === 0) {
                        this.opt.noMatch(kw);
                    }
                    if (kwArr[kwArrLen - 1] === kw) {
                        this.opt.done(totalMatches);
                    }
                });
            });
        }

        unmark(opt) {
            this.opt = opt;
            let sel = this.opt.element ? this.opt.element : "*";
            sel += "[data-markjs]";
            if (this.opt.className) {
                sel += `.${ this.opt.className }`;
            }
            this.log(`Removal selector "${ sel }"`);
            this.forEachContext(ctx => {
                const matches = ctx.querySelectorAll(sel);
                Array.prototype.slice.call(matches).forEach(el => {
                    if (!this.matchesExclude(el, false)) {
                        this.unwrapMatches(el);
                    }
                });
            }, this.opt.done);
        }

    }

    window.Mark = function (ctx) {
        const instance = new Mark(ctx);
        this.mark = (sv, opt) => {
            instance.mark(sv, opt);
            return this;
        };
        this.markRegExp = (sv, opt) => {
            instance.markRegExp(sv, opt);
            return this;
        };
        this.unmark = opt => {
            instance.unmark(opt);
            return this;
        };
        return this;
    };

    return window.Mark;
}, window, document);
