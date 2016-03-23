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
            var queryString = '';
            var queryStringElements = [];
            var queryOperator = queryContent.Or;
            var queryTeamAuthoredTweets = queryContent.TeamAut;
            var queryTeamMentionedTweets = queryContent.TeamMen;
            var queryPlayerAuthoredTweets = queryContent.PlayerAut;
            var queryPlayerMentionedTweets = queryContent.PlayerMen;
            delete queryContent.TeamAut;
            delete queryContent.TeamMen;
            delete queryContent.PlayerAut;
            delete queryContent.PlayerMen;
            delete queryContent.Or;

            //so we are now sending an answer to the ajax request with res.write,
            // we are writing a json string that represents the array of tweets.
            // in the success handler of the ajax request call on the front end,
            // we modify the page's html to display the tweets.




            // check Lodash, _.pick[queryContent[queryContent,'playerName','teamName'];
            //filtering out all the key value pairs which are empty
            for(var key in queryContent){
              //making sure we iterate only on real keys and not prototype keys.
              if(!queryContent.hasOwnProperty(key)){ continue; }
              if(queryContent[key] !== ''){
                queryStringElements.push(queryContent[key]);
              }
            }

            //building the query string from the filtered non-empty strings.
            if (queryOperator === 'No') {
                queryString = queryStringElements.join(' ');
            }else{
               queryString = queryStringElements.join(' OR ');
            }

            //checks if author and mentions checkboxes are ticked for team
            var teamAutAndMention = (queryTeamAuthoredTweets === 'YES') && (queryTeamMentionedTweets ==='YES');
            //checks if author and mentions checkboxes are ticked for player
            var playerAutAndMention = (queryPlayerAuthoredTweets === 'YES') && (queryPlayerMentionedTweets === 'YES');
            console.log(queryString);
                //doing the query

                /*The if statements below check for the different cases possible with the queries*/
            var tweetsArray;
            if ((teamAutAndMention && playerAutAndMention) ||
                ((queryTeamAuthoredTweets === 'YES') && playerAutAndMention) ||
                ((queryPlayerAuthoredTweets === 'YES') && teamAutAndMention)) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, listStatuses) {
                        tweetsArray.push(JSON.stringify(data.statuses));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.teamName},
                            function listStatuses(err, data, listPlayerStatuses) {
                                tweetsArray.push(JSON.stringify(data));

                                client.get('statuses/user_timeline', {screen_name: queryContent.playerName},
                                    function listPlayerStatuses(err, data, response) {
                                        tweetsArray.push(JSON.stringify(data));
                                        var tweets = JSON.parse(tweetsArray[0]);
                                        var tweetsB = JSON.parse(tweetsArray[1]);
                                        var tweetsC = JSON.parse(tweetsArray[2]);
                                        intermediateTweets = tweetsB.concat(tweetsC);
                                        finalTweets = tweets.concat(intermediateTweets);
                                        res.write(JSON.stringify(finalTweets), function (err) {
                                            res.end();
                                        });
                                    });
                            });
                    });
            }
            else if (teamAutAndMention) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, listStatuses) {
                        tweetsArray.push(JSON.stringify(data.statuses));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.teamName},
                            function listStatuses(err, data, response) {
                                tweetsArray.push(JSON.stringify(data));
                                var tweets = JSON.parse(tweetsArray[0]);
                                var tweetsB = JSON.parse(tweetsArray[1]);
                                finalTweets = tweets.concat(tweetsB);
                                res.write(JSON.stringify(finalTweets), function (err) {
                                    res.end();
                                });
                            });
                    });
            }
            else if (playerAutAndMention) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, listStatuses) {
                        tweetsArray.push(JSON.stringify(data.statuses));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.playerName},
                            function listStatuses(err, data, response) {
                                tweetsArray.push(JSON.stringify(data));
                                var tweets = JSON.parse(tweetsArray[0]);
                                var tweetsB = JSON.parse(tweetsArray[1]);
                                finalTweets = tweets.concat(tweetsB);
                                res.write(JSON.stringify(finalTweets), function (err) {
                                    res.end();
                                });
                            });
                    });
            }
            else if ((queryOperator === 'YES') && (queryTeamAuthoredTweets === 'YES') && (queryPlayerAuthoredTweets === 'YES')) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('statuses/user_timeline', {screen_name: queryContent.teamName},
                    function listTeamStatuses(err, data, listPlayerStatuses) {
                        tweetsArray.push(JSON.stringify(data));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.playerName},
                            function listPlayerStatuses(err, data, response) {
                                tweetsArray.push(JSON.stringify(data));
                                var tweets = JSON.parse(tweetsArray[0]);
                                var tweetsB = JSON.parse(tweetsArray[1]);
                                finalTweets = tweets.concat(tweetsB);
                                res.write(JSON.stringify(finalTweets), function (err) {
                                    res.end();
                                });
                            });
                    });
            }
            else if ((queryTeamAuthoredTweets === 'YES') && (queryOperator === 'YES')) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, listStatuses) {
                        tweetsArray.push(JSON.stringify(data.statuses));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.TeamName},
                            function listStatuses(err, data, response) {
                                tweetsArray.push(JSON.stringify(data));
                                var tweets = JSON.parse(tweetsArray[0]);
                                var tweetsB = JSON.parse(tweetsArray[1]);
                                finalTweets = tweets.concat(tweetsB);
                                res.write(JSON.stringify(finalTweets), function (err) {
                                    res.end();
                                });
                            });
                    });
            }
            else if ((queryPlayerAuthoredTweets === 'YES') && (queryOperator === 'YES')) {
                tweetsArray = [];
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, listStatuses) {
                        tweetsArray.push(JSON.stringify(data.statuses));
                        /* Callback function which waits until the data from searchTweets is complete
                         before running */
                        client.get('statuses/user_timeline', {screen_name: queryContent.playerName},
                            function listStatuses(err, data, response) {
                                tweetsArray.push(JSON.stringify(data));
                                var tweets = JSON.parse(tweetsArray[0]);
                                var tweetsB = JSON.parse(tweetsArray[1]);
                                finalTweets = tweets.concat(tweetsB);
                                res.write(JSON.stringify(finalTweets), function (err) {
                                    res.end();
                                });
                            });
                    });
            }
            else if (queryTeamAuthoredTweets === 'YES') {
                client.get('statuses/user_timeline', {screen_name: queryContent.teamName},
                    function listStatuses(err, data, response) {
                        res.write(JSON.stringify(data), function (err) {
                            res.end();
                        });
                    });
            }
            else if (queryPlayerAuthoredTweets === 'YES') {
                client.get('statuses/user_timeline', {screen_name: queryContent.playerName},
                    function listStatuses(err, data, response) {
                        res.write(JSON.stringify(data), function (err) {
                            res.end();
                        });
                    });
            }
            else {
                client.get('search/tweets', {q: queryString, count: 300},
                    function searchTweets(err, data, response) {
                        res.write(JSON.stringify(data.statuses), function (err) {
                            res.end();
                        });
                    });
            }
        });
    }

    else {
        file.serve(req, res, function (err, result) {
            if (err !== null) {
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
