var request = require('request');
var jsdom = require("jsdom");
var mkdirp = require("mkdirp");
var fs = require('fs');

var comicId = undefined;
var downloadRoot = "./download/" + comicId + "/";
var volumes = [];
var comicImage = {
    protocol: "http",
    domain: "",
    path: "",
    fileType: "",
    getFullUrl: function (volume, page) {
        return comicImage.protocol + "://" + comicImage.domain + "/" + comicImage.path + volume + "/" + page + comicImage.fileType;
    },
    getUrlParts: function (pageLink, callback) {
        jsdom.env(pageLink, ["https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js"],
            function (err, window) {
                var $ = window.$;
                $.each($("img[oncontextmenu=\"return false\"]"), function (k, v) {
                    var link = $(v).attr("src");

                    // https://images.google.com/?gws_rd=ssl => ["https:", "", "images.google.com", "?gws_rd=ssl"]
                    link = link.split("/");
                    if (link[0].indexOf("http") > -1) {
                        comicImage.protocol = link[0].replace(":", '');
                        link.shift(); //remove protocol
                        link.shift(); //remove empty space
                    } else {
                        comicImage.protocol = "http";
                    }
                    comicImage.domain = link[0];
                    link.shift(); //remove domain
                    comicImage.fileType = "." + link[link.length - 1].split(".")[1];
                    link.pop(); //remove filename
                    link.pop(); //remove volume

                    for (var i in link) {
                        comicImage.path += link[i] + "/";
                    }
                });
                callback(comicImage.getFullUrl("{vol}", "{page}"));
            }
        );

    }
};


if (isNaN(parseInt(comicId)) || comicId == undefined || comicId == null) {
    comicId = parseInt(process.argv[2]);
    downloadRoot = "./download/" + comicId + "/";
}
if (isNaN(comicId)) throw new Error("Please provide comic ID: `npm run 123` or `node index.js 123`");

// get volume list
console.log("Getting content page...");
jsdom.env(
    "http://www.cartoomad.com/comic/" + comicId + ".html",
    ["https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js"],
    function (err, window) {
        var $ = window.$;
        var a = [];
        $.each($("a"), function (k, v) {
            var text = $(v).html();
            if (text.charAt(0) == "第" && (text.charAt(6) == "話" || text.charAt(6) == "卷")) {
                a.push($(v));
            }
        });

        console.log("Getting image link template...");
        comicImage.getUrlParts($("base").attr("href") + $(a[0]).attr("href"), function (urlTemplate) {
            console.log("=> " + urlTemplate);
            console.log("Building download list...");

            //select volume list
            console.log("Extract image link...");
            $.each(a, function (k, v) {
                var volume = {
                    index: $(v).html().replace(/\D/g,""),
                    href: $("base").attr("href") + $(v).attr("href"),
                    images: [],
                    pages: $(v).next().html().replace(/\D/g,"")
                };
                for (var i = 1; i <= parseInt(volume.pages); i++) {
                    var page = i;
                    if (i < 10) page = "00" + i;
                    if (i < 100 && i > 9) page = "0" + i;
                    volume.images.push({url: comicImage.getFullUrl(volume.index, page), page: page});
                }
                volumes.push(volume);
            });

            //start download
            mkdirp.sync(downloadRoot);
            var counter = 0;
            var downloaded = [];
            for (var i in volumes) {
                var vol = volumes[i].index;
                try {
                    fs.accessSync("./download/" + comicId + "/" + vol, fs.F_OK);
                    downloaded.push(vol);
                    // directory exist
                } catch (e) {
                    for (var j in volumes[i].images) {
                        var img = volumes[i].images[j];
                        requestDownload({
                            url: img.url,
                            dest: "./download/" + comicId + "/" + vol + "/" + img.page + comicImage.fileType,
                            vol: vol,
                            page: img.page
                        }, counter++ * 400);
                    }
                }
            }
            if (downloaded.length > 0) {
                console.log(downloaded.join(", ") + " already downloaded, skip.")
            }

        });

    }
);

var requestDownload = function (job, delay) {
    setTimeout(function () {
        console.log("Downloading: " + job.url);
        if (job.page == "001") {
            mkdirp.sync(downloadRoot + job.vol);
        }
        request({
            url: job.url
        }).pipe(
            fs.createWriteStream(job.dest)
        ).on('error', function (error) {
            console.log(error);
        });
    }, delay);
};


// use batch async request => Error: connect EMFILE (too many files open)
// limit download process, use callback to download next one => stack overflow
