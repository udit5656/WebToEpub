"use strict";

module("FreeWebNovelParser");

QUnit.test("extractTitleImpl", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    let title = parser.extractTitle(dom);
    assert.equal(title, "All Jobs and Classes! I Just Wanted One Skill, Not Them All!");
});

QUnit.test("extractAuthor", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    let author = parser.extractAuthor(dom);
    assert.equal(author, "Comedian0");
});

QUnit.test("extractSubject", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    let subject = parser.extractSubject(dom);
    assert.equal(subject, "Action, Adventure, Comedy");
});

QUnit.test("findCoverImageUrl", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelNovelSample, "text/html");
    let base = dom.createElement("base");
    base.href = "https://freewebnovel.com/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all";
    dom.head.appendChild(base);
    let parser = new FreeWebNovelParser();
    let cover = parser.findCoverImageUrl(dom);
    assert.equal(cover, "https://freewebnovel.com/files/article/image/14/14511/14511s.jpg");
});

QUnit.test("getChapterUrls first page", async function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    let base = dom.createElement("base");
    base.href = "https://freewebnovel.com/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all";
    dom.head.appendChild(base);

    let chapterUrlsUI = {
        showTocProgress: function() {}
    };

    let chapters = await parser.getChapterUrls(dom, chapterUrlsUI);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].title, "Chapter 01");
    assert.equal(chapters[0].sourceUrl, "https://freewebnovel.com/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all/chapter-1");
});

QUnit.test("getChapterUrls merges paginated TOC pages without duplicates", async function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelPaginatedNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    parser.rateLimitDelay = async function() {};
    let requestedUrls = [];
    let originalFetchJson = HttpClient.fetchJson;
    HttpClient.fetchJson = async function(url) {
        requestedUrls.push(url);
        return {json: {code: 200, html: FreeWebNovelSecondTocPage}};
    };

    let progressUpdates = [];
    let chapterUrlsUI = {
        showTocProgress: function(chapters) {
            progressUpdates.push(chapters);
        }
    };

    try {
        let chapters = await parser.getChapterUrls(dom, chapterUrlsUI);
        assert.deepEqual(requestedUrls, ["https://freewebnovel.com/novel/example?ajax=chapters&page=2"]);
        assert.deepEqual(chapters.map(chapter => chapter.title), ["Chapter 1", "Chapter 2", "Chapter 3"]);
        assert.equal(progressUpdates.length, 2, "progress is reported for the first and added TOC pages");
    } finally {
        HttpClient.fetchJson = originalFetchJson;
    }
});

QUnit.test("getChapterUrls rejects failed or invalid paginated TOC pages", async function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelPaginatedNovelSample, "text/html");
    let parser = new FreeWebNovelParser();
    parser.rateLimitDelay = async function() {};
    let chapterUrlsUI = {showTocProgress: function() {}};
    let originalFetchJson = HttpClient.fetchJson;

    HttpClient.fetchJson = async function() {
        throw new Error("request failed");
    };
    try {
        await parser.getChapterUrls(dom, chapterUrlsUI);
        assert.ok(false, "a failed TOC request must reject");
    } catch (error) {
        assert.ok(/request failed/.test(error.message), "the fetch failure is propagated");
    } finally {
        HttpClient.fetchJson = originalFetchJson;
    }

    HttpClient.fetchJson = async function() {
        return {json: {code: 200, html: "<ul></ul>"}};
    };
    try {
        await parser.getChapterUrls(dom, chapterUrlsUI);
        assert.ok(false, "an empty TOC page must reject");
    } catch (error) {
        assert.ok(/contains no chapters/.test(error.message), "the empty TOC response is rejected");
    } finally {
        HttpClient.fetchJson = originalFetchJson;
    }

    HttpClient.fetchJson = async function() {
        return {json: {code: 500, html: FreeWebNovelSecondTocPage}};
    };
    try {
        await parser.getChapterUrls(dom, chapterUrlsUI);
        assert.ok(false, "an unsuccessful TOC response must reject");
    } catch (error) {
        assert.ok(/Invalid FreeWebNovel TOC response/.test(error.message), "the unsuccessful TOC response is rejected");
    } finally {
        HttpClient.fetchJson = originalFetchJson;
    }
});

QUnit.test("findChapterTitle", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelChapterSample, "text/html");
    let parser = new FreeWebNovelParser();
    let titleEl = parser.findChapterTitle(dom);
    assert.equal(titleEl.textContent.trim(), "Chapter 01");
});

QUnit.test("findContent and clean", function (assert) {
    let dom = new DOMParser().parseFromString(FreeWebNovelChapterSample, "text/html");
    let parser = new FreeWebNovelComParser();
    let content = parser.findContent(dom);
    assert.ok(content !== null, "Content found");
    parser.removeUnwantedElementsFromContentElement(content);
    
    assert.equal(content.querySelector("div[id^='bg-ssp-']"), null, "Ads removed");
    assert.equal(content.querySelector("div[id^='pf-']"), null, "PubFuture ads removed");
    
    let paragraphs = [...content.querySelectorAll("p")];
    let watermarkFound = paragraphs.some(p => p.textContent.includes("This story originates from"));
    assert.notOk(watermarkFound, "Watermark paragraph removed");
    
    // Check that embedded watermarks (with math alphanumeric characters and standard ASCII) are removed
    assert.equal(paragraphs[0].textContent.trim(), "It started with the kind of  cold that crawls under your nails and refuses to leave.");
    assert.equal(paragraphs[1].textContent.trim(), "Screams. The thunder of  crumpling steel.");
});

QUnit.test("convert literal HTML tags", function (assert) {
    let dom = new DOMParser().parseFromString("<div><p>&lt;strong&gt;[Name: Aster Nilm&lt;/strong&gt;</p></div>", "text/html");
    let parser = new FreeWebNovelParser();
    let content = dom.querySelector("div");
    parser.removeUnwantedElementsFromContentElement(content);
    
    let strong = content.querySelector("strong");
    assert.ok(strong !== null, "Strong element parsed");
    assert.equal(strong.textContent, "[Name: Aster Nilm");
});

QUnit.test("clean preserves ordinary subscripts and surrounding compatibility characters", function (assert) {
    let dom = new DOMParser().parseFromString(
        "<div><p>H<sub>2</sub>O, item ①, and 𝘧𝑟𝑒𝑒𝘸𝘦𝘣𝑛𝑜𝘷𝑒𝓁.𝘤𝘰𝓂 remain.</p></div>",
        "text/html"
    );
    let parser = new FreeWebNovelComParser();
    let content = dom.querySelector("div");
    parser.removeUnwantedElementsFromContentElement(content);

    assert.equal(content.innerHTML, "<p>H<sub>2</sub>O, item ①, and  remain.</p>");
});

QUnit.test("clean removes watermarks split across inline elements", function (assert) {
    let dom = new DOMParser().parseFromString(
        "<div><p>Before <span>𝘧𝑟𝑒𝑒</span><em>𝘸𝘦𝘣𝑛𝑜𝘷𝑒𝓁.𝘤𝘰𝓂</em> after.</p></div>",
        "text/html"
    );
    let parser = new FreeWebNovelParser();
    let content = dom.querySelector("div");
    parser.removeUnwantedElementsFromContentElement(content);

    assert.equal(content.textContent, "Before  after.");
});

let FreeWebNovelNovelSample = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:url" content="https://freewebnovel.com/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all">
</head>
<body>
    <div class="m-imgtxt">
        <div class="pic">
            <img src="/files/article/image/14/14511/14511s.jpg">
        </div>
        <div class="txt">
            <div class="item">
                <span class="glyphicon glyphicon-user" title="Author"></span>
                <div class="right"><a href="/author/Comedian0">Comedian0</a></div>
            </div>
            <div class="item">
                <span class="glyphicon glyphicon-th-list" title="Genre"></span>
                <div class="right">
                    <a href="/genre/Action">Action</a>, <a href="/genre/Adventure">Adventure</a>, <a href="/genre/Comedy">Comedy</a>
                </div>
            </div>
        </div>
    </div>
    <div class="m-desc">
        <h1 class="tit">All Jobs and Classes! I Just Wanted One Skill, Not Them All!</h1>
    </div>
    <ul class="ul-list5" id="idData">
        <li><a href="/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all/chapter-1" title="Chapter 01">Chapter 01</a></li>
        <li><a href="/novel/all-jobs-and-classes-i-just-wanted-one-skill-not-them-all/chapter-2" title="Chapter 02">Chapter 02</a></li>
    </ul>
</body>
</html>
`;

let FreeWebNovelPaginatedNovelSample = `
<!DOCTYPE html>
<html>
<head><base href="https://freewebnovel.com/novel/example"></head>
<body>
    <select id="indexselect"><option>1</option><option>2</option></select>
    <ul id="idData">
        <li><a href="/novel/example/chapter-1">Chapter 1</a></li>
        <li><a href="/novel/example/chapter-2">Chapter 2</a></li>
    </ul>
</body>
</html>
`;

let FreeWebNovelSecondTocPage = `
<ul id="idData">
    <li><a href="/novel/example/chapter-2">Chapter 2</a></li>
    <li><a href="/novel/example/chapter-3">Chapter 3</a></li>
</ul>
`;

let FreeWebNovelChapterSample = `
<!DOCTYPE html>
<html>
<body>
    <span class="chapter">Chapter 01</span>
    <div class="txt ">
        <div id="article">
            <div id="pf-1558-1">ad script</div>
            <p>It started with the kind of <b>𝘧𝑟𝑒𝑒𝘸𝘦𝘣𝑛𝑜𝘷𝑒𝓁.𝘤𝘰𝓂</b> cold that crawls under your nails and refuses to leave.</p>
            <div id="bg-ssp-6327">ad banner</div>
            <p>This story originates from a different website. Ensure the author gets the support they deserve by reading it there.</p>
            <p>Screams. The thunder of reewebnovel.com crumpling steel.</p>
        </div>
    </div>
</body>
</html>
`;
