var http = require('http');
var static = require('node-static');
var util = require('util');
var url = require('url');
var querystring = require('querystring');
var Twit = require('twit');
var twitter = require('twitter-text');
var client = new Twit({
  consumer_key: 'o19ZQHXFRvb16vRdlhiKRR4UZ',
  consumer_secret: 'BaZMfCaBKcSLHTC7gwupjIOHBlq587ZnpU6VnFEEnoAlWsCkKW',
  access_token: '1519284373-PAvCS78UF0CoOcdnnz1p35OYYjIUnWQ6Tsi2iM6',
  access_token_secret: 'o8PdyK3uXrCVW0Orh6AP8maBB0S93sbvmI4Kbs1jzmTVd'
});


var file = new(static.Server)();
var portNo = 3001;
var app = http.createServer(function(req, res) {
  var pathname = url.parse(req.url).pathname;

  function prepareTweets(input) {
    input.forEach(function(current) {
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

      //checks if author and mentions checkboxes are ticked for team
      var teamAutAndMention = (queryTeamAuthoredTweets === 'YES') && (queryTeamMentionedTweets === 'YES');
      //checks if author and mentions checkboxes are ticked for player
      var playerAutAndMention = (queryPlayerAuthoredTweets === 'YES') && (queryPlayerMentionedTweets === 'YES');
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
            cb(err, finalTweets);
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

      function receivedTweets(err, tweets) {
        if (err) {
          console.log(err);
          return sendJsonResponse({
            error: "There was an error: " + err
          }, false);
        }
        console.log(tweets);
        sendJsonResponse(tweets);
      }

      /*The if statements below check for the different cases possible with the queries*/
      if ((teamAutAndMention && playerAutAndMention) ||
        ((queryTeamAuthoredTweets === 'YES') && playerAutAndMention) ||
        ((queryPlayerAuthoredTweets === 'YES') && teamAutAndMention)) {

        getTweets(queryString, queryContent.teamName, queryContent.playerName, receivedTweets);
      } else if (teamAutAndMention) {
        getTweets(queryString, queryContent.teamName, null, receivedTweets);
      } else if (playerAutAndMention) {
        getTweets(queryString, null, queryContent.playerName, receivedTweets);
      } else if ((queryOperator === 'YES') && (queryTeamAuthoredTweets === 'YES') && (queryPlayerAuthoredTweets === 'YES')) {
        getTweets(null, queryContent.teamName, queryContent.playerName, receivedTweets);
      } else if ((queryTeamAuthoredTweets === 'YES') && (queryOperator === 'YES')) {
        getTweets(queryString, queryContent.teamName, null, receivedTweets);
      } else if ((queryPlayerAuthoredTweets === 'YES') && (queryOperator === 'YES')) {
        getTweets(queryString, null, queryContent.playerName, receivedTweets);
      } else if (queryTeamAuthoredTweets === 'YES') {
        getTweets(null, queryContent.teamName, null, receivedTweets);
      } else if (queryPlayerAuthoredTweets === 'YES') {
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
