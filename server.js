var http = require('http');
var static = require('node-static');
var util = require('util');
var url = require('url');
var querystring = require('querystring');
var Twit = require('twit');
var client = new Twit({
  consumer_key: 'H7cNvGoBMjRFqsopTHbD2u7xe',
  consumer_secret: 'zSAR0PLBZkwtjE0mRqCTEeZbV3RNXf9GPM2Kg3757terJjtL8z',
  access_token: '316270387-5s8n1Lg0OtB3KhUgB0OI86OnbWxJrrIT6FW4vytc',
  access_token_secret: 'XyJImFCO6CYf8lo8YzwjOFw1wBXJWjA2OFCEY7naTmSf4'
});


var file = new (static.Server)();
var portNo = 3001;
var app = http.createServer(function (req, res) {
    var pathname = url.parse(req.url).pathname;
    if ((req.method == 'POST') && (pathname == '/postFile.html')) {
        var body = '';
        req.on('data', function (data) {
            body += data;
            // if body >  1e6 === 1 * Math.pow(10, 6) ~~~ 1MB
            // flood attack or faulty client
            // (code 413: req entity too large), kill req
            if (body.length > 1e6) {
                res.writeHead(413,
                    {'Content-Type': 'text/plain'}).end();
                req.connection.destroy();
            }

        });
        req.on('end', function () {
            var queryContent = JSON.parse(body);
            console.log(queryContent);
            client.get('search/tweets', {q: queryContent.teamName, count: 10, geocode: queryContent.location+","+queryContent.radius },
                function listDroneTweets(err, data, response) {
                    var tweets = [];
                    for (var indx in data.statuses) {
                        var tweet = data.statuses[indx];
                        tweets.push('on: ' + tweet.created_at + ' : @' + tweet.user.screen_name + ' : ' + tweet.text+'\n\n')
                    }
                    console.log(tweets);
                });
        });
    }

    else {
        file.serve(req, res, function (err, result) {
            if (err != null) {
                console.error('Error serving %s - %s', req.url, err.message);
                if (err.status === 404 || err.status === 500) {
                    file.serveFile(util.format('/%d.html', err.status), err.status, {}, req, res);
                } else {
                    res.writeHead(err.status, err.headers);
                    res.end();
                }
            } else {
                res.writeHead(200, {"Content-Type": "text/plain", 'Access-Control-Allow-Origin': '*'});

            }
        });
    }
}).listen(portNo);
