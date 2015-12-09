var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongo = require('mongodb').MongoClient;

if( !process.env.mongo_url ) {
  console.error("Environment variables are not set. Set variables before running.");
  process.exit(0)
}

var db = null
var policies = []
var candidates = []

mongo.connect(process.env.mongo_url, function(err, database) {
  console.log("Connected to the mongo database.")
  db = database
  db.collection('policies').find({}).toArray(function(err, docs) { policies=docs })
  db.collection('candidates').find({}).toArray(function(err, docs) { candidates=docs })
})

io.on('connection', function(socket) {
  console.log('New connection received.')
  // build stats
  var allVotes = db.collection("votes").find({}).toArray(function(err, docs){
      // Send the current data
      var candidatesDict = {}
      var policiesDict = {}

      for(var i = 0; i < docs.length; i++) {
        var current = docs[i]
        if(!candidatesDict[current.candidate_id]) {
          candidatesDict[current.candidate_id] = 1
        } else {
          candidatesDict[current.candidate_id] += 1
        }

        if(!policiesDict[current.policy_id]) {
          policiesDict[current.policy_id] = 1
        } else {
          policiesDict[current.policy_id] += 1
        }
      }

      var welcomeBlob = {
          policies: policies,
          candidates: candidates,
          stats: {candidates: candidatesDict, policies: policiesDict}
      };

      io.emit('welcome', JSON.stringify(welcomeBlob))
      io.emit('scauth', JSON.stringify({username: process.env.spark_username, password: process.env.spark_pass}))
  })

  socket.on('votesubmission', function(msg) {
    console.log("New vote submitted: " + JSON.stringify(msg))
    // validate the submission
    try {
        // msg = JSON.parse(msg)
        // console.log(msg)
        if(!msg.policy_id || !msg.candidate_id) {
          console.error("Vote submission is invalid.")
          return
        }

        // add time stamp
        msg.date = new Date()

        // insert it to the database and let everybody else know!
        db.collection("votes").insert(msg, function(err, records) {
          if(!err) {
            io.emit('new_submission', JSON.stringify(msg))
          } else {
            console.log("ERROR: " + err)
          }
        })
    } catch(ex) {
      // ignore it
      console.error("Vote submission is invalid due to error: ")
      console.error(ex)
    }
  });
});

http.listen(process.env.PORT || 3000, function() {
  console.log('listening on *:' + process.env.PORT);
});
