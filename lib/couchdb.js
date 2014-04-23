var nano = require('nano')('http://localhost:5984');

//callback(db)

function getOrCreateDb(name, callback) {
  nano.db.get(name, function(err, body) {
    if (err && err.status_code === 404) {
      nano.db.create(name, function() {
        callback(nano.use(name));
      });
    } else {
      callback(nano.use(name));
    }

  });
}

function fetchAllRevDocs(db, docId, revs, cb) {
    var revisions = [];
    if (revs) {
        revs.forEach(function(rev, i) {
            db.get(docId, {
                rev: rev.rev
            }, function(err, res) {
                if (err) cb(err);
                else {
                    revisions.push(res);
                    if (revs.length - 1 === i) {
                        cb(undefined,revisions);
                    }
                }
            });
        });
    }
}

function getRevisionsIds(db, docId, cb) {

    db.get(docId, {
        revs_info: true
    }, function(err, res) {
        if (err) cb(err);
        else if (res._revs_info) {
            fetchAllRevDocs(db, docId, res._revs_info, cb);
        }
    });
}


module.exports.getDocumentRevisions = function(mapId, docId, cb){
  var db = nano.db.use(mapId);
  getRevisionsIds(db, docId, function(err, res){
    cb(err, res);
  });
};

//rows.[i].doc => data
module.exports.list = function(dbId, callback) {
  getOrCreateDb(dbId, function(db) {
    var params = {
      "include_docs": true
    };
    db.list(params, function(err, body) {
      if (!err) {
        callback(undefined, body);
      } else {
        callback(err);
      }
    });
  });
};


module.exports.getChanges = function(dbId, callback) {
  getOrCreateDb(dbId, function(db) {
    db.changes(function(err, body) {
      if (!err) {
        callback(undefined, body);
      } else {
        callback(err);
      }
    });
  });
};

function update(db, obj, key, callback) {
  db.get(key, function(error, existing) {
    if (!error) obj._rev = existing._rev;
    db.insert(obj, key, callback);
  });
}

module.exports.insert = function(dbId, data, primary, callback) {
  getOrCreateDb(dbId, function(db) {
    db.insert(data, primary, function(err, res) {
      if (err) {
        if (err.status_code && err.status_code === 409) {
          update(db, data, primary, function(err2, res2) {
            if (err2) {
              callback(err2);
            } else {
              callback(undefined, res2);
            }
          });
        } else {
          console.log(err);
        }
      } else {
        callback(undefined, res);
      }
    });
  });
};

module.exports.delete = function(dbId, obj, key, callback) {
  getOrCreateDb(dbId, function(db) {
    db.get(key, function(error, existing) {
      if (!error) {
        obj._rev = existing._rev;

        existing._deleted = true;

        db.insert(existing, key, callback);
      } else {
        console.log(error);
      }
    });

  });
};

function getLatestRevision(db, key, cb) {
  db.get(key, {
    revs_info: true
  }, function(err, res) {
    if (err) cb(err);
    else cb(undefined, res._revs_info[0].rev);

  });
}

module.exports.revertFeature = function(dbId, key, toRev, cb) {
  var db = nano.use(dbId);
  getLatestRevision(db, key, function(err, currentRev) {
    //TODO: ERRORHANDLING
    if(err) console.log(err);
    db.get(key, {rev: toRev}, function(err, res) {
      if (!err) {
        res._rev = currentRev;
        db.insert(res, key, function(iErr, iRes){
          cb(iErr, iRes, res);
        });
      }else{
        cb(err);
      }
    });
  });
};