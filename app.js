process.chdir(__dirname);

var express = require("express");
var app = express();
var portfinder = require("portfinder");
var server = require("http").Server(app);
var io = require("socket.io")(server);
var chokidar = require('chokidar');
var __path__ = require('path');
var fs = require('fs');
var byline = require('byline');
var ip = require("ip");
const notifier = require('node-notifier');
var client = require('node-rest-client').Client;
var async = require('async');

var settings = require(__path__.resolve('.', 'config', 'settings'));
var mapping = require(__path__.resolve('.', 'config',settings.instrumentJSONMapping));
var target = settings.targetFolder;
var deleteWhenDone = settings.deleteWhenDone;
var options_auth = {user: settings.lisUser, password: settings.lisPassword};

var watcher = chokidar.watch(target, {ignored: /[\/\\]\./, persistent: true});

function showMsg(title, msg, wait, callback) {

    notifier.notify({
        title: title,
        message: msg,
        icon: __path__.resolve('.', 'images', 'mindray.jpg'),
        wait: (wait ? wait : false) // Wait with callback, until user action is taken against notification
    }, function (err, response) {

        // Response is response from notification
        if(callback && response) {

            callback();

        }

    });
}

watcher.on('add', function(path) {

    setTimeout(function(){

        var root = path.substring(target.length);
        var links = [];

        if(root) {

            var filename = root;

            var mode = ''; //MAP | RESULT
            var map = {}, id_pos = null, name_pos = null;
            var map = {}, test_pos = null, sample_pos = null, result_pos;

            console.log("New file added " + path);

            showMsg("New File", "New file added " + path);

            var stream = byline(fs.createReadStream(path, { encoding: 'utf8' }));


            stream.on('data', function(line) {

                var  sections = line.split(',');

                if (line && line.match('TestDefine#')){
                    mode = "MAP";
                }else if (line && line.match('TestDetail#')){
                    mode = "RESULT";
                }else if (sections[0].match(/\#/)){
                    mode = '';
                }

                if (mode == 'MAP' && sections.length > 2){

                    if ((id_pos == null)) {
                        id_pos = sections.indexOf('ID') >= 0 ? sections.indexOf('ID') : id_pos;
                        name_pos = sections.indexOf('Name') >= 0 ? sections.indexOf('Name') : name_pos;
                    }else if (sections[id_pos]){
                        map[sections[id_pos]] = sections[name_pos];
                    }
                }

                if(mode == 'RESULT' && sections.length > 5 && map != {} > 0){
                    if ((test_pos == null)) {
                        test_pos = sections.indexOf('ItemID') >= 0 ? sections.indexOf('ItemID') : test_pos;
                        sample_pos = sections.indexOf('SampleID') >= 0 ? sections.indexOf('SampleID') : sample_pos;
                        result_pos = sections.indexOf('TestResult') >= 0 ? sections.indexOf('TestResult') : result_pos;
                    }else if (sections[test_pos] && map[sections[test_pos]]){

                        try {
                            if (mapping[map[sections[test_pos]].toUpperCase()]) {
                                var measure_name = mapping[map[sections[test_pos]].toUpperCase()];
                            } else {
                                var measure_name = map[sections[test_pos]].toUpperCase();
                            }
                        }catch(e){
                            measure_name = '-1';
                        }

                        var sample_id = sections[sample_pos];
                        var result = sections[result_pos];
                        try {
                            if(parseInt(result) < 0) {
                                result = '';
                            }
                        }catch(e){}

                        var link = settings.lisPath
                            .replace(/\#\{SPECIMEN_ID\}/, sample_id)
                            .replace(/\#\{MEASURE_ID\}/, measure_name)
                            .replace(/\#\{RESULT\}/, result);

                        (new client(options_auth)).get(link, function (data) {

                            console.log("Measure: " + measure_name + ", Sample ID: " + sample_id + ", Result: " + result);

                        });

                    }
                }

            });

            stream.on('end', function() {

                showMsg("Success!", "Finished sending results for file " + path);

                if(deleteWhenDone) {

                    fs.unlinkSync(path);

                }

            })

        }

    }, 2000);
})


portfinder.basePort = settings.hostPort;

portfinder.getPort(function (err, port) {

    server.listen(port, function () {

        console.log("✔ Server running on port %d in %s mode", port, app.get("env"));

        showMsg("Server Status", "✔ Server running on port " + port + " in " + app.get("env") + " mode");

    });

});

module.exports = server;