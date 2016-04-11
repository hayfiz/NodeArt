/*
 * Authored by Leonard Enoch & Hayford I.
 *
 * */

var http = require('http');
var NodeStatic = require('node-static');
var util = require('util');
var url = require('url');
var querystring = require('querystring');
var Twit = require('twit');
var twitter = require('twitter-text');
var mongojs = require('mongojs');
var _ = require('lodash');

// Credentials to access the Twitter Api hidden in a credentials folder.
var credentials = require("./credentials");

var client = new Twit(credentials);

// mongoDB setup
var dbUrl = 'localhost/nodeart';
var collections = ['queries'];
var db = mongojs(dbUrl, collections);

var file = new(NodeStatic.Server)();

// PORT=9000 node serve1.js
var portNo = process.env.PORT || 3001;

http.createServer(function(req, res) {
    var pathname = url.parse(req.url).pathname;

    /**
     * A method to prepare tweets by activating twitter entities. to activate in-tweet links.
     * links are page links, authors user and screen name, hashtags etc.
     *
     * @method prepareTweets
     * @param {Object} input Tweet object
     * @param {String} input.user.name The name of an author of a tweet.
     * @param {Function} current A function that auto links the input tweet object
     * @param {string} current.text the tweet text auto linked.
     * @return {Object} Returns a tweet object with entities activated.
     */
    function prepareTweets(input) {
        input[0].forEach(function(current) {
            if(current.text) {
                current.htmlContent = twitter.autoLink(twitter.htmlEscape(current.text));
            }
        });
    }

    /**
     * A method that sends a Json response to the client side.
     * response must be prepared before being sent.
     *
     * @method sendJsonResponse
     * @param {Object} input tweet object
     * @param {Boolean} [prepare==false]  checking if there are tweet objects to prepare.
     * @return {Object} Returns stringified tweet object to the client side.
     */
  // Send a json object/array to the client
    function sendJsonResponse(input, prepare) {
        if (prepare !== false) {

            // Check if there are no tweets
            if (!input[0] || !input[0].length) {
                return sendErrorResponse("No tweets found.");
            }
            prepareTweets(input);
        }
        res.end(JSON.stringify(input));
    }

    /**
     * A method that sends an error object response to the client side.
     * Send an object like { "error": "Something bad happened" } to the client
     *
     * @method sendErrorResponse
     * @param {object} error object
     * @return {Object} Returns stringified error object to the client side.
     */
    function sendErrorResponse(err) {
        if (!err) { return; }
        console.log(err);
        res.writeHead(400);
        return sendJsonResponse({
            error: "There was an error: " + err.toString()
        }, false);
    }
    // handles the post request from Ajax in the client side.
    //so we are now sending an answer to the ajax request with res.write,
    // we are writing a json string that represents the array of tweets.
    // in the success handler of the ajax request call on the front end,
    // we modify the page's html to display the tweets.
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
            var tweetObjects = [];

            // query return variables
            var queryOperator = queryContent.Or; //( AND/OR)
            var qTATweets = queryContent.TeamAut; // (queryTeamAuthoredTweets)
            var qTMTweets = queryContent.TeamMen; // (queryTeamMentionedTweets)
            var qPlATweets = queryContent.PlayerAut; // (queryPlayerAuthoredTweets)
            var qPlMTweets = queryContent.PlayerMen; // (queryPlayerMentionedTweets)
            var queryType = 0;

            delete queryContent.TeamAut;
            delete queryContent.TeamMen;
            delete queryContent.PlayerAut;
            delete queryContent.PlayerMen;
            delete queryContent.Or;


            // might use Lodash, _.pick[queryContent[queryContent,'playerName','teamName'];
            // filtering out all the key value pairs which are empty
            // making sure we iterate only on real keys and not prototype keys.
            Object.keys(queryContent).forEach(function (key) {
                var value = queryContent[key];
                if (value !== '') {
                    queryStringElements.push(value);
                }
            });

            // building the query string from the filtered non-empty strings.
            if (queryOperator === 'No') {
                queryString = queryStringElements.join(' ');
            } else {
                queryString = queryStringElements.join(' OR ');
            }

            /**
             * A simple boolean checker function.
             *
             * @method checkIfYes
             * @param {Object} value
             * @return {Boolean} Returns true on success
             */
            function checkIfYes(value) {
                return value === 'YES';
            }


            //checks if author and mentions checkboxes are ticked for a team
            var teamAutAndMention = checkIfYes(qTATweets) && checkIfYes(qTMTweets);
            //checks if author and mentions checkboxes are ticked for a player
            var playerAutAndMention = checkIfYes(qPlATweets) && checkIfYes(qPlMTweets);
            console.log(queryString);

            /**
             *  The main function that searches for tweets with aid of the twitter API.
             *  This involves a callback to searchTweets.
             *
             * @method searchTweets
             * @param {String} queryString a query string from a user
             * @param {Function} cb.callback A callback function on a query.
             */
            function searchTweets(queryString, cb) {
                /* Function call for mentions search which calls back to getUserTimeline
                 in order to gain access to authored tweets */
                client.get('search/tweets', {
                    q: queryString,
                    count: 300 //, geocode: "53.383055,-1.464795,200km"
                }, function(err, res) {
                    cb(err, res && res.statuses);
                });
            }

            /**
             *  A Function that accesses twitter via the API the return some tweet object
             * based on a username.
             *
             * @method getUserTimeline
             * @param {String} username a twitter user screen name
             * @param {Function} cb.callback A callback function on a query
             * @return {Boolean} Returns a tweet object of username.
             */
            function getUserTimeline(username, cb) {
                client.get('statuses/user_timeline', {
                    screen_name: username
                }, cb);
            }
            /**
             * A method to get the queried tweet objects for teams and players and process
             * them in order to be returned to the client side
             *
             * @method getTweets
             * @param {String} searchQueryString The queryString requested to be queried by a user.
             * @param {String} teamName string of tweets pertaining to a team
             * @param {Object} playerName object of tweets pertaining to a player
             * @param {callback} cb A callback function on the querystring if there are more than one q
             * @return {Object} Returns tweets on success. - concatenated tweets if request is more than one.
             */
            function getTweets(searchQueryString, teamName, playerName, cb) {
                var complete = 0;
                var errors = [];
                var finalTweets = [];  // (final tweet object to be returned)
                var queryArray = [searchQueryString, teamName+''+playerName,teamName, playerName];

                /**
                 * A method to check if a queried tweet object has been returned so the next query can be processed
                 * This is based on a call back.
                 *
                 * @method done
                 * @param {error} err an error
                 * @param {Object} tweets object
                 * @return {Boolean} Returns an error or a tweet object based on success or failure
                 */
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

            /**
             * A method that handles received tweets. Handles the database caching of tweets with MongoDB
             * Updates current tweets and send tweet object as a Json response to the browser.
             *
             * @method receivedTweets
             * @param {String} err  an error
             * @param {Object} tweets the tweets objects to be added to the database and processed.
             * @param {String} queryString of which tweet objects were searched for.
             */
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
                        var retrieved_count = _.size(sTweets); // sTweets.length
                        var added_count = 0;
                        // Iterate arrays --> myArray.forEach(function (current) { ... });
                        // cTweet -> currentTweet
                        tweets.forEach(function (cTweet) {
                            // using return to avoid having the code on two levels when you can have on one.
                            // If statement checking for the latest tweets
                            // if new tweets update the db otherwise return.
                            if (Date.parse(cTweet.created_at) <= Date.parse(sTweets[0].created_at)) {return;}
                            // Update the database if the current Tweet is AFTER the previous tweets
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
                                if (err) { return console.error(err);}
                                console.log('added tweet');
                            });
                            // Put the latest tweets on the top.
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
                        // sendJsonResponse({tweets: sTweets, info: { count: ..., added: 42 } });
                        sendJsonResponse(tweetObjects);
                    }
                });
            }

            // The if statements below check for the different cases possible with each of the queries
            // Still looking fot a better way to work on this.
            if ((teamAutAndMention && playerAutAndMention) ||
                (checkIfYes(qTATweets) && playerAutAndMention) ||
                (checkIfYes(qPlATweets) && teamAutAndMention)) {

                // Tweets are received based on queries.
                getTweets(queryString, queryContent.teamName, queryContent.playerName, receivedTweets);
            } else if (teamAutAndMention) {
                getTweets(queryString, queryContent.teamName, null, receivedTweets);
            } else if (playerAutAndMention) {
                getTweets(queryString, null, queryContent.playerName, receivedTweets);
            } else if (checkIfYes(queryOperator) && (checkIfYes(qTATweets) && (checkIfYes(qPlATweets) ))) {
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
        // Handles server errors.
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