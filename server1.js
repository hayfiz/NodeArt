var http = require('http');
var NodeStatic = require('node-static');
var util = require('util');
var url = require('url');
var querystring = require('querystring');
var Twit = require('twit');
var twitter = require('twitter-text');
var mongojs = require('mongojs');
var _ = require('lodash');

var credentials = require("./credentials");

var client = new Twit(credentials);


//db
var dbUrl = 'localhost/nodeart';
var collections = ['queries'];
var db = mongojs(dbUrl, collections);

var file = new(NodeStatic.Server)();
// PORT is an environment variable used by services to specify the node.js port
// PORT=9000 node serve1.js
var portNo = process.env.PORT || 3001;

http.createServer(function(req, res) {
    var pathname = url.parse(req.url).pathname;


    function prepareTweets(input) {
        input[0].forEach(function(current) {
            //current.authorContent = twitter.autoLink(twitter.htmlEscape(current.user.screen_name));
           // current.userContent = twitter.autoLink(twitter.htmlEscape(current.user.name));
            current.htmlContent = twitter.autoLink(twitter.htmlEscape(current.text));

        });
    }


    function sendJsonResponse(input, prepare) {
        if (prepare !== false) {
            prepareTweets(input);
        }
        res.end(JSON.stringify(input));
    }

    if ((req.method == 'POST') && (pathname == '/postFile.html')) {
        var body = '';
        req.on('data', function(data) {
            body += data;
            // if body >  1e6 === 1 * Math.pow(10, 6) ~~~ 1MB
            // flood attack or faulty client
            // (code 413: req entity too large), kill req
            if (body.length > 1e6) {
                res.writeHead(413, {
                    'Content-Type': 'text/plain'
                }).end();
                req.connection.destroy();
            }
        });
        req.on('end', function() {
            var queryContent = JSON.parse(body);
            console.log(queryContent);

            var queryString = '';
            var queryStringElements = [];
            var databaseObjects = [];
            var tweetObjects = [];
            var queryOperator = queryContent.Or;
            var qTATweets = queryContent.TeamAut;
            var qTMTweets = queryContent.TeamMen;
            var qPlATweets = queryContent.PlayerAut;
            var qPlMTweets = queryContent.PlayerMen;
            var querydb = queryContent.dbQuery;
            var queryType = 0;
            delete queryContent.TeamAut;
            delete queryContent.TeamMen;
            delete queryContent.PlayerAut;
            delete queryContent.PlayerMen;
            delete queryContent.Or;
            delete queryContent.dbQuery;


            //so we are now sending an answer to the ajax request with res.write,
            // we are writing a json string that represents the array of tweets.
            // in the success handler of the ajax request call on the front end,
            // we modify the page's html to display the tweets.




            // check Lodash, _.pick[queryContent[queryContent,'playerName','teamName'];
            //filtering out all the key value pairs which are empty
            for (var key in queryContent) {
                //making sure we iterate only on real keys and not prototype keys.
                if (!queryContent.hasOwnProperty(key)) {
                    continue;
                }
                if (queryContent[key] !== '') {
                    queryStringElements.push(queryContent[key]);
                }
            }

            //building the query string from the filtered non-empty strings.
            if (queryOperator === 'No') {
                queryString = queryStringElements.join(' ');
            } else {
                queryString = queryStringElements.join(' OR ');
            }

             function checkIfYes(value) {
                return value === 'YES';
            }


            //checks if author and mentions checkboxes are ticked for team
            var teamAutAndMention = checkIfYes(qTATweets) && checkIfYes(qTMTweets);

            //checks if author and mentions checkboxes are ticked for player
            var playerAutAndMention = checkIfYes(qPlATweets) && checkIfYes(qPlMTweets);
            console.log(queryString);

            function searchTweets(queryString, cb) {
                /* Function call for mentions search which calls back to listStatuses
                 in order to gain access to authored tweets */
                client.get('search/tweets', {
                    q: queryString,
                    count: 300 //, geocode: "53.383055,-1.464795,200km"
                }, function(err, res) {
                    cb(err, res && res.statuses);
                });
            }

            function getUserTimeline(username, cb) {
                client.get('statuses/user_timeline', {
                    screen_name: username
                }, cb);
            }

            function getTweets(searchQueryString, teamName, playerName, cb) {
                var complete = 0;
                var errors = [];
                var finalTweets = [];
                var queryArray = [searchQueryString, teamName+''+playerName,teamName, playerName];


                function done(err, tweets) {
                    if (err) {
                        errors.push(err);
                    } else {
                        finalTweets = finalTweets.concat(tweets);
                    }
                    if (--complete === 0) {
                        if (errors.length) {
                            err = errors[0];
                        } else {
                            err = null;
                        }
                        cb(err, queryArray[queryType],finalTweets);

                    }
                }

                if (searchQueryString) {
                    ++complete;
                    searchTweets(searchQueryString, done);
                }

                if (teamName) {
                    ++complete;
                    getUserTimeline(teamName, done);
                }
                if (playerName) {
                    ++complete;
                    getUserTimeline(playerName, done);
                }
            }

            function receivedTweets(err, queryString,tweets) {
                if (err) {
                    return sendErrorResponse(err);
                }
                // Create the object with data in it
                // Performance: a bit faster because it's assigning the space in memory from start,
                // without needed to assign for each dynamically added field

                var db_entry = {
                    query: queryString,
                    queryOperator: queryOperator,
                    queryTeamAuthoredTweets: qTATweets,
                    queryTeamMentionedTweets: qTMTweets,
                    queryPlayerAuthoredTweets: qPlATweets,
                    queryPlayerMentionedTweets: qPlMTweets,
                    tweets: tweets
                };

                // creating an exact copy of the db_entry object that contains simple data type.
                //so it does'nt modify the original data
                var findQuery = JSON.parse(JSON.stringify(db_entry)); /*_.cloneDeep(db_entry);*/ 
                delete findQuery.tweets;

//                                                 Check if it exists
                // find(query) => [obj, obj1, obj2...]              if (res.length) { e } else { d }
                // findOne(query) => obj                            if (res) { exists } else { doesn't exist }
                db.queries.findOne(findQuery, function(err, foundQuery) {
                    if (err) {
                        return sendErrorResponse(err);
                    }

                    if (!foundQuery) {
                       db.queries.save(db_entry, function(err, cachedTweets) {
                            if (!cachedTweets) {
                               err = "No tweets were saved."
                            }
                            if (err) {
                                return sendErrorResponse(err);
                            }
                           var howMany = _.size(db_entry.tweets);
                           sendJsonResponse([db_entry.tweets, {
                               count: howMany,
                               added: howMany
                           }]);
                        });
                    } else {
                        var sTweets = foundQuery.tweets;
                        var retrieved_count = sTweets.length;
                        var added_count = 0;
                        // Iterate object fields
                        // Object.keys(obj).forEach(...)

                        // Iterate arrays
                        // myArray.forEach(function (current) { ... });
                        // cTweet -> currentTweet
                        tweets.forEach(function (cTweet) {
                            // using sre return to avoid having the code on two levels when you can have on one level
                            // 1. Not using return
                            // if (true) {
                            //   do something
                            // }
                            // 2. Using return
                            // if (false) { return; }
                            // do something
                            if (Date.parse(cTweet.created_at) <= Date.parse(sTweets[0].created_at)) {
                                return;
                            }

                            // Update if the cTweet is AFTER the previous tweets
                            db.queries.update({
                                query: queryString,
                                queryOperator: queryOperator,
                                queryTeamAuthoredTweets: qTATweets,
                                queryTeamMentionedTweets: qTMTweets,
                                queryPlayerAuthoredTweets: qPlATweets,
                                queryPlayerMentionedTweets: qPlMTweets
                            }, {
                                $push: {tweets: cTweet}
                            }, function (err) {

                                // Process:
                                //  - stdout (standard out)
                                //  - stderr (standard error)
                                //
                                // 1. Write in the stdout
                                // console.log("Something");
                                // process.stdout.write("Something\n");
                                // 2. Write in the stderr
                                // console.error("Something really bad happened");
                                // process.stderr.write("Something really bad happened\n");

                                if (err) {
                                    return console.error(err);
                                }

                                console.log('added tweet');
                            });

                            sTweets.unshift(cTweet);
                            added_count++;
                        });

                        console.log('Results returned by the database: ' + retrieved_count);
                        console.log('New tweets stored into database: ' + added_count);

                        var info = {
                            count: retrieved_count || sTweets.length,
                            added: added_count || sTweets.length
                        };

                        // [[tweet1, t2, t3, tN], { added: 42 }]
                        tweetObjects.push(sTweets, info);

                        // sendJsonResponse({
                        //   tweets: sTweets,
                        //   info: { count: ..., added: 42 }
                        // });
                            sendJsonResponse(tweetObjects);
                    }
                });
            }


          /*The if statements below check for the different cases possible with the queries*/
            if ((teamAutAndMention && playerAutAndMention) ||
                (checkIfYes(qTATweets) && playerAutAndMention) ||
                (checkIfYes(qPlATweets) && teamAutAndMention)) {

                getTweets(queryString, queryContent.teamName, queryContent.playerName, receivedTweets);
            } else if (teamAutAndMention) {
                getTweets(queryString, queryContent.teamName, null, receivedTweets);
            } else if (playerAutAndMention) {
                getTweets(queryString, null, queryContent.playerName, receivedTweets);
            } else if (checkIfYes(queryOperator) && (checkIfYes(qTATweets) && (checkIfYes(qPlATweet) ))) {
                queryType = 1;
                getTweets(null, queryContent.teamName, queryContent.playerName, receivedTweets);
            } else if (checkIfYes(qTATweets)  && (checkIfYes(queryOperator))) {
                getTweets(queryString, queryContent.teamName, null, receivedTweets);
            } else if (checkIfYes(qPlATweets) && checkIfYes(queryOperator)) {
                getTweets(queryString, null, queryContent.playerName, receivedTweets);
            } else if (checkIfYes(qTATweets)) {
                queryType = 2;
                getTweets(null, queryContent.teamName, null, receivedTweets);
            } else if (checkIfYes(qPlATweets)){
                queryType = 3;
                getTweets(null, null, queryContent.playerName, receivedTweets);
            } else {
                getTweets(queryString, null, null, receivedTweets);
            }
        });
    } else {
        file.serve(req, res, function(err, result) {
            if (err !== null) {
                console.error('Error serving %s - %s', req.url, err.message);
                if (err.status === 404 || err.status === 500) {
                    file.serveFile(util.format('/%d.html', err.status), err.status, {}, req, res);
                } else {
                    res.writeHead(err.status, err.headers);
                    res.end();
                }
            } else {
                res.writeHead(200, {
                    "Content-Type": "text/plain",
                    'Access-Control-Allow-Origin': '*'
                });

            }
        });
    }
}).listen(portNo);