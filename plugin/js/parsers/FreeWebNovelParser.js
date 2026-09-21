"use strict";

parserFactory.register("freewebnovel.com", () => new FreeWebNovelComParser());
parserFactory.register("bednovel.com", () => new FreeWebNovelParser());
parserFactory.register("innnovel.com", () => new FreeWebNovelParser());
parserFactory.register("libread.com", () => new FreeWebNovelParser());
parserFactory.register("novellive.com", () => new NovelliveParser());
parserFactory.register("novellive.app", () => new NovelliveParser());
parserFactory.register("novellive.net", () => new NovelliveParser());
parserFactory.register("readwn.org", () => new NovelliveParser());

class FreeWebNovelParser extends Parser {

    constructor() {
        super();
        this.minimumThrottle = 1000;
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        let menu = dom.querySelector("ul#idData");
        let chapters = this.removeDuplicateChapterUrls(util.hyperlinksToChapterList(menu));

        let totalPage = 1;
        let indexSelect = dom.querySelector("#indexselect");
        if (indexSelect) {
            totalPage = indexSelect.querySelectorAll("option").length;
        } else {
            let scripts = [...dom.querySelectorAll("script")];
            for (let script of scripts) {
                let match = /totalPage:\s*(\d+)/.exec(script.textContent);
                if (match) {
                    totalPage = parseInt(match[1]);
                    break;
                }
            }
        }

        if (totalPage > 1) {
            chapterUrlsUI.showTocProgress(chapters);
            let baseUrl = dom.baseURI;
            let urlObj = new URL(baseUrl);
            urlObj.search = "";
            urlObj.hash = "";
            let baseNovelUrl = urlObj.toString();

            for (let page = 2; page <= totalPage; ++page) {
                await this.rateLimitDelay();
                let url = `${baseNovelUrl}?ajax=chapters&page=${page}`;
                let response = await HttpClient.fetchJson(url);
                if (response?.json?.code !== 200 || typeof response.json.html !== "string") {
                    throw new Error(`Invalid FreeWebNovel TOC response for page ${page}.`);
                }

                let parser = new DOMParser();
                let tempDom = parser.parseFromString(response.json.html, "text/html");
                util.setBaseTag(url, tempDom);
                let partialChapters = util.hyperlinksToChapterList(tempDom);
                if (partialChapters.length === 0) {
                    throw new Error(`FreeWebNovel TOC page ${page} contains no chapters.`);
                }

                partialChapters = this.removeDuplicateChapterUrls(partialChapters, chapters);
                if (partialChapters.length > 0) {
                    chapterUrlsUI.showTocProgress(partialChapters);
                    chapters = chapters.concat(partialChapters);
                }
            }
        }

        return chapters;
    }

    removeDuplicateChapterUrls(chapters, existingChapters = []) {
        let seenUrls = new Set(existingChapters.map(chapter => util.normalizeUrlForCompare(chapter.sourceUrl)));
        return chapters.filter(chapter => {
            let normalizedUrl = util.normalizeUrlForCompare(chapter.sourceUrl);
            if (seenUrls.has(normalizedUrl)) {
                return false;
            }
            seenUrls.add(normalizedUrl);
            return true;
        });
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.tit");
    }

    extractAuthor(dom) {
        let element = dom.querySelector("[title=Author]");
        return element ? element.parentNode.querySelector("a").textContent.trim() : "";
    }

    extractSubject(dom) {
        let element = dom.querySelector("[title=Genre]");
        if (!element) {
            return "";
        }
        let tags = [...element.parentNode.querySelectorAll("a")];
        return tags.map(e => e.textContent.trim()).join(", ");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.pic");
    }

    findChapterTitle(dom) {
        return dom.querySelector("span.chapter");
    }

    findContent(dom) {
        return dom.querySelector("div#article") || dom.querySelector("div.txt");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.inner")];
    }

    removeUnwantedElementsFromContentElement(content) {
        // Remove ads injected by third-party ad networks (such as SSP ads and PubFuture networks)
        // whose div IDs start with 'bg-ssp-' or 'pf-'
        util.removeChildElementsMatchingSelector(content, "div[id^='bg-ssp-'], div[id^='pf-']");

        // Clean up any remaining ad divs or empty wrapper divs left behind after ads are deleted
        for (let div of content.querySelectorAll("div")) {
            if (div.id.startsWith("bg-ssp-") || div.id.startsWith("pf-")) {
                div.remove();
            }
            // Remove parent wrapper divs if they are now completely empty
            if (div.children.length === 0 && div.textContent.trim() === "") {
                div.remove();
            }
        }

        // Convert escaped/literal HTML tags (like &lt;strong&gt; or &lt;b&gt;) in text nodes to actual DOM elements
        let walker = content.ownerDocument.createTreeWalker(
            content,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        let nodesToReplace = [];
        let node;
        while ((node = walker.nextNode())) {
            let val = node.nodeValue;
            if (val && /(<strong|<b|<i|<em|<span|<br)/i.test(val)) {
                nodesToReplace.push(node);
            }
        }
        for (let tNode of nodesToReplace) {
            let parent = tNode.parentNode;
            if (parent) {
                let doc = util.sanitize(tNode.nodeValue);
                let body = doc.body;
                while (body.firstChild) {
                    parent.insertBefore(body.firstChild, tNode);
                }
                tNode.remove();
            }
        }

        this.removeEmbeddedWatermarks(content);

        super.removeUnwantedElementsFromContentElement(content);
    }

    static isWatermarkText(text) {
        return /f?reewebnovel(?:\s*\.\s*com|\s+com)?/i.test(text.normalize("NFKD"));
    }

    removeEmbeddedWatermarks(content) {
        let walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
        let normalizedText = "";
        let characterLocations = [];
        let previousContainer = null;
        let node;

        while ((node = walker.nextNode())) {
            let container = node.parentElement.closest("p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre");
            if (previousContainer !== null && previousContainer !== container) {
                normalizedText += "\n";
                characterLocations.push(null);
            }
            previousContainer = container;

            let value = node.nodeValue;
            for (let sourceIndex = 0; sourceIndex < value.length;) {
                let character = String.fromCodePoint(value.codePointAt(sourceIndex));
                let nextSourceIndex = sourceIndex + character.length;
                let normalizedCharacter = character.normalize("NFKD");
                normalizedText += normalizedCharacter;
                for (let index = 0; index < normalizedCharacter.length; ++index) {
                    characterLocations.push({
                        node: node,
                        start: sourceIndex,
                        end: nextSourceIndex
                    });
                }
                sourceIndex = nextSourceIndex;
            }
        }

        let rangesByNode = new Map();
        let watermarkPattern = /f?reewebnovel(?:\s*\.\s*com|\s+com)?/gi;
        let match;
        while ((match = watermarkPattern.exec(normalizedText)) !== null) {
            for (let index = match.index; index < match.index + match[0].length; ++index) {
                let location = characterLocations[index];
                if (location == null) {
                    continue;
                }
                let ranges = rangesByNode.get(location.node) || [];
                ranges.push({start: location.start, end: location.end});
                rangesByNode.set(location.node, ranges);
            }
        }

        for (let [textNode, ranges] of rangesByNode) {
            ranges.sort((a, b) => a.start - b.start || a.end - b.end);
            let value = textNode.nodeValue;
            let cleanedValue = "";
            let cursor = 0;
            for (let range of ranges) {
                if (range.end <= cursor) {
                    continue;
                }
                cleanedValue += value.substring(cursor, range.start);
                cursor = range.end;
            }
            textNode.nodeValue = cleanedValue + value.substring(cursor);
        }
    }
}

class NovelliveParser extends FreeWebNovelParser {

    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return this.getChapterUrlsFromMultipleTocPages(dom,
            this.extractPartialChapterList,
            this.getUrlsOfTocPages,
            chapterUrlsUI
        );
    }

    getUrlsOfTocPages(dom) {
        // lastUrl should be example https://novellive.com/book/<some-novel-name>/<index>
        let lastUrl = [...dom.querySelectorAll(".page a.index-container-btn")]?.pop()?.href;
        let urls = [];
        if (lastUrl) {
            let lastTocIndex = lastUrl.lastIndexOf("/");
            let lastIndexPageName = lastUrl.substring(lastTocIndex + 1);
            let lastIndex = parseInt(lastIndexPageName);
            let tocHasMultiplePages = !isNaN(lastIndex);
            if (tocHasMultiplePages) {
                let baseUrl = lastUrl.substring(0, lastTocIndex + 1);
                for (let i = 2; i <= lastIndex; ++i) {
                    urls.push(baseUrl + i);
                }
            }
        }
        return urls;
    }

    extractPartialChapterList(dom) {
        return [...dom.querySelector(".m-newest2").querySelectorAll("ul li a")]
            .map(a => util.hyperLinkToChapter(a));
    }
}

class FreeWebNovelComParser extends FreeWebNovelParser {
    constructor() {
        super();
    }
    removeUnwantedElementsFromContentElement(content) {
        // Some watermarks are wrapped in sub elements. Keep genuine subscripts.
        for (let sub of content.querySelectorAll("p sub")) {
            if (FreeWebNovelParser.isWatermarkText(sub.textContent)) {
                sub.remove();
            }
        }

        // Remove anti-scraping watermark paragraphs warning users to support the author on the original site
        for (let p of content.querySelectorAll("p")) {
            let text = p.textContent.toLowerCase();
            if (text.includes("this story originates from") || text.includes("ensure the author gets the support")) {
                p.remove();
            }
        }

        super.removeUnwantedElementsFromContentElement(content);
    }
}
