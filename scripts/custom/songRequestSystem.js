/*
 * Copyright (C) 2020 Michael Walker
 * MIT license, see LICENSE file.
 */

/**
 * songRequestSystem.js
 *
 * This module enables the channel mods to open/close song request and 
 * viewers to suggest songs.
 * Data stored in DB for continuity and sent via websocke to UI.
 */
(function() {

    
    var requests = {
        areOpen: true,
        songs: {},
        history: [],
        playedSongs: []
    }

    var nextSongId = 0; //global for how to make song ids (static variable ideally)
    function Song(name, displayName) {
        this.keyName  = name;
        this.displayName = displayName;
        this.songId    = nextSongId++;
        this.voters    = [];
        this.votes     = 0;
    }

    // //object we rewrite constantly to send data to the obs overlay websocket.
    // var cachedChartData = [];
    // function getChartDataForRequests(maxData = 10) {
    //     var topRequests = getTopRequests();
    //     topRequests.map(function(s) { return {label : s.name, }})
    //     for (var i = 0; i < objOBS.length; i++) {
    //         if (objOBS[i].label == poll.options[optionIndex])
    //             objOBS[i].votes++;
    //     }
    // }
        
    //Returns ordered ARRAY of name, votes pairs. begining of array is highest votes.
    function getTopRequests() {
        var requestDataSimple = Object.keys(requests.songs).map(function(key, index) {
            return {
                id : requests.songs[key].songId,
                name : requests.songs[key].displayName, 
                votes : requests.songs[key].votes
            };
          });
        
        return requestDataSimple.sort(function (a, b) {return (a.votes < b.votes) ? 1 : -1});
    }

    var nextRequestHistId = 0;
    function recordHistory(requestor, songDisplayName, songStdName) {
        requests.history.push({
            requestId: nextRequestHistId++,
            sender: requestor, 
            song: songDisplayName, 
            songNameStd: songStdName,
            time: (new Date()).getTime()
        } );
    }

    function getRecentHistory(maxHistory) {
        var shortHistory = requests.history.slice(-maxHistory, requests.history.length);
        return shortHistory.reverse();
    }

//DB Docs: https://community.phantom.bot/t/datastore-inidb-api/80
//Quick Ref
//Set/get with section
    // void $.inidb.SetString(String table_name, String section, String key, String value)
    // String $.inidb.GetString(String table_name, String section, String key)
//Section == "" to ignore
// List sections
    // String[] $.inidb.GetCategoryList(String table_name)

    /*
     * DB Schema
     *  
     *  table: request_data
        keys: request data elts + single array of names, ptr to request_songs

     *  table: request_songs
        section: song name
        keys: song data elts
     */ 
    function loadDbData() {

        //TODO: TRY
        var readRequests = {};
        readRequests.areOpen = $.inidb.GetBoolean("request_data", "areOpen", "") && true;
        readRequests.openSongs = JSON.parse($.inidb.GetString("request_data", "songs", ""));
        
        
        var songDataArray = [];
        var songNameList = $.inidb.GetCategoryList("request_songs")
        var songDataArray = songNameList.map(function(song) {
            var displayName = $.inidb.GetString("request_songs", song, "displayName") + "";
            var readSong = new Song(song  + "", displayName);
            readSong.voters = JSON.parse($.inidb.GetString("request_songs", song, "voters"))
            readSong.votes = $.inidb.GetInteger("request_songs", song, "votes")
            readSong.songId = $.inidb.GetInteger("request_songs", song, "songId")
            nextSongId = Math.max(readSong.songId+1, nextSongId);
            return readSong;
        });

        //Convert songs to map
        var songDataMap = songDataArray.reduce(function(result, item, index, array) {
            result[item.keyName] = item;
            return result;
          }, {}) //NOTE: Passing the empty {}, which is passed as initial "result"

        readRequests.songs = songDataMap;
        
        //Read History
        readRequests.history = JSON.parse($.inidb.GetString("request_data", "history", ""));

        return readRequests;
    }

    function saveDbData() {
        $.inidb.SetBoolean("request_data", "areOpen", "", requests.areOpen);
        //open song list
        var songNameArray = Object.keys(requests.songs);
        $.inidb.SetString("request_data", "songs", "", JSON.stringify(songNameArray));

        $.inidb.SetString("request_data", "history", "", JSON.stringify(requests.history));

        songNameArray.forEach(function(songName) {
            var song = requests.songs[songName];
            $.inidb.SetString("request_songs", song.songName, "displayName", song.displayName)
            $.inidb.SetString("request_songs", song.songName, "voters", JSON.stringify(song.voters))
            $.inidb.SetInteger("request_songs", song.songName, "votes",  song.votes)
            $.inidb.SetInteger("request_songs", song.songName, "songId",  song.songId)
        });

    }

    //Sends top song data to the web socket
    function sendTopSongData() {
        $.consoleLn("Sending top songs")
        $.panelsocketserver.sendJSONToAll(JSON.stringify({
            'eventFamily': 'requests',
            'eventType': 'top_songs',
            'data': JSON.stringify(getTopRequests())
        }));
    }
    
    //Sends top song data to the web socket
    function sendRecentHistory() {
        const SEND_HIST_SIZE = 10;

        $.consoleLn("Sending request history");
        
        var recentList = getRecentHistory(SEND_HIST_SIZE);
        var serializedList = JSON.stringify(recentList)

        $.consoleLn(serializedList);

        $.panelsocketserver.sendJSONToAll(JSON.stringify({
            'eventFamily': 'requests',
            'eventType': 'request_history',
            'data': serializedList
        }));
    }

    function sendRequestsClosed() {
        $.consoleLn("Sending requests closed")
        $.panelsocketserver.sendJSONToAll(JSON.stringify({
            'eventFamily': 'requests',
            'eventType': 'requests_closed'
        }));
    }


    /**
     * @function hasKey
     * @param {Array} list
     * @param {*} value
     * @param {Number} [subIndex]
     * @returns {boolean}
     */
    function hasKey(list, value, subIndex) {
        var i;

        if (subIndex > -1) {
            for (i in list) {
                if (list[i][subIndex].equalsIgnoreCase(value)) {
                    return true;
                }
            }
        } else {
            for (i in list) {
                if (list[i].equalsIgnoreCase(value)) {
                    return true;
                }
            }
        }
        return false;
    };


    function openRequests() {
        if(requests.areOpen) return false;

        requests.areOpen = true;
        //request open time?

        sendTopSongData();
        sendRecentHistory();
        return true;
    }

    function closeRequests() {
        if(!requests.areOpen) return false;
        
        requests.areOpen = false;

        //request close time?
        sendRequestsClosed();
        return true;
    }

    function resetRequests() {
        requests.songs = {};
        requests.history = [];
        sendTopSongData();
    }


    function standardizeName(songName) {
        return songName.toLowerCase(); //TODO: Clean me more?
    }

    function sayReplyNonBot(sender, text) {
        if(sender != 'plampbot') {
            $.say($.whisperPrefix(sender) + text);
        } else {
            $.consoleLn("[CONSOLE_ONLY] " + text);
        }
    }

     /**
     * @function makeRequest
     * @param {string} sender
     * @param {string} voteText
     */
    function makeRequest(sender, songName) {
        if (!requests.areOpen) {
            sayReplyNonBot(sender, $.lang.get('songrequest.request.notopen'));
            return;
        }

        //lookup song
        
        var cleanSongName = standardizeName(songName);
        
        //TODO: validate song name and reject (length? injection? profanity?)
        var songInvalid = cleanSongName.length > 30;
        if(songInvalid) {
            sayReplyNonBot(sender, $.lang.get('songrequest.reject.length', songName));
            return;
        }

        //Retrieve current song data, or insert if it does not exist
        if(hasKey(Object.keys(requests.songs), cleanSongName)) {
            var currentSong = requests.songs[cleanSongName];
            if (hasKey(currentSong.voters, sender.toLowerCase())) {
                sayReplyNonBot(sender, $.lang.get('songrequest.request.already'));
                return;
            }    
        } else {
            //Make new song and insert
            var currentSong = new Song(cleanSongName, songName);
            requests.songs[cleanSongName] = currentSong;
        }

        currentSong.voters.push(sender);
        currentSong.votes++;

        //Record history
        recordHistory(sender, currentSong.displayName, currentSong.keyName);
        sayReplyNonBot(sender, $.lang.get('songrequest.request.accepted', currentSong.displayName, currentSong.votes));

        //Send data to overlay UI
        sendTopSongData();
        sendRecentHistory();

        return true;
        
        ////OLD inidb Sync setting
        //Used in web\panel\js\pages\extra\poll.js
        //This is used in the actual source. Not editable without forking source.
        //However my ui should be able to read this too, in the future
        //So the main control UI not the overlay UI
        // $.inidb.incr('pollVotes', poll.options[optionIndex], 1);
    };

    function updateRequestPlayed(songName, sender) {
        $.consoleLn("mark played request: " + songName + " by " + sender)
        var stdName = standardizeName(songName);

        if(requests.songs.hasOwnProperty(stdName)) {
            var songdata = requests.songs[stdName]
            delete requests.songs[stdName];
            requests.playedSongs.push(songdata); //Add to played history.

            //Can't use whisperPrefix to everyone, so send one group message.
            var voterString = ""
            if(songdata.voters.length > 0) {
                voterString = "@" + songdata.voters.join(", @")
            } else {
                voterString = "none of yall"
            }
            
            sendTopSongData();
            $.say($.lang.get('songrequest.update.played', songdata.displayName, voterString));
            //Mark played
        } else {
            //Complain
            sayReplyNonBot(sender, $.lang.get('songrequest.update.notfound'));
        }
    };

    function updateRequestDelete(songName, sender) {
        $.consoleLn("delete request: " + songName + " by " + sender)
        var stdName = standardizeName(songName);

        if(requests.songs.hasOwnProperty(stdName)) {
            delete requests.songs[stdName];
            sendTopSongData();
            sayReplyNonBot(sender, $.lang.get('songrequest.update.deleted', stdName));
        } else {
            sayReplyNonBot(sender, $.lang.get('songrequest.update.notfound'));
        }
    };

    //from https://www.qvera.com/kb/index.php/1156/json-stringify-throws-an-exception
    var replacer = function(key, value) {
        var returnValue = value;
        try {
           if (value.getClass() !== null) { // If Java Object
            $.consoleLn(key + ': value.getClass() = ' + value.getClass());
              if (value instanceof java.lang.Number) {
                 returnValue = 1 * value;
              } else if (value instanceof java.lang.Boolean) {
                 returnValue = value.booleanValue();
              } else { // if (value instanceof java.lang.String) {
                 returnValue = '' + value;
              }
           }
        } catch (err) {
           // No worries... not a Java object
        }
        return returnValue;
     };
 
     
    /**
     * @event command
     */
    $.bind('command', function(event) {
        //Adding "" to cast as js strings. blows up serialization if not done
        var sender = "" + event.getSender().toLowerCase(),
            command = event.getCommand(),
            argsString = "" + event.getArguments().trim(),
            args = event.getArgs(),
            action = args[0];

        
        // if (command.equalsIgnoreCase('vote') && action !== undefined) {
        //     if (poll.pollRunning) {
        //         vote(sender, action);
        //     }
        // }
        
        //db docs: https://community.phantom.bot/t/datastore-inidb-api/80
        if (command.equalsIgnoreCase('dbtest') ) {
            $.consoleLn("Running DB Test. Sender: " + sender);
            void $.inidb.RemoveFile("request_data")
            void $.inidb.RemoveFile("request_songs")
            
            $.consoleLn("saving data");
            saveDbData();
            $.consoleLn("reading data");
            var songData = loadDbData();
            $.consoleLn(JSON.stringify(songData, replacer));
            $.consoleLn("actual requests:");
            $.consoleLn(JSON.stringify(requests, replacer));
            return;
        }
        
        if (command.equalsIgnoreCase('request') ) {//&& argsString.length > 0
            // $.say($.whisperPrefix(sender) + "attempting request for " + argsString);
            var requestAccepted = makeRequest(sender, argsString);
            return;
        }

        if (command.equalsIgnoreCase('songrequests')) {
            //Default action: give some stats on the poll.
            if (!action) {
                if (requests.areOpen) {
                    // var optionsStr = "";
                    // for (var i = 0; i < poll.options.length; i++) {
                    //     optionsStr += (i + 1) + ") " + poll.options[i] + (i == poll.options.length - 1 ? "" : " ");
                    // }
                    //TODO: GET TOP SONGS
                    sayReplyNonBot(sender, $.lang.get('songrequest.defaultaction.open', ' Use "!songrequests [top | new]" to see requests.'));
                } else {
                    sayReplyNonBot(sender, $.lang.get('songrequest.defaultaction.closed'));
                }
                return;
            } else if (action.equalsIgnoreCase('open')) {
                if (requests.areOpen) {
                    $.say($.lang.get('songrequest.action.openagain'));
                    return;
                }
                $.say($.lang.get('songrequest.action.open'));

                openRequests();
            } else if (action.equalsIgnoreCase('close')) {
                if (!requests.areOpen) {
                    $.say($.lang.get('songrequest.action.closeagain'));
                    return;
                }
                $.say($.lang.get('songrequest.action.close'));

                closeRequests();
            } else if (action.equalsIgnoreCase('reset')) {
                $.say($.lang.get('songrequest.action.reset'));
                resetRequests();
            } else if (action.equalsIgnoreCase('top')) {
                if(Object.keys(requests.songs).length == 0) {
                    $.say($.lang.get('songrequest.norequests'));
                    return;
                }
 
                var topSongArray = getTopRequests().slice(0,5);
                var topSongString = "";
                for (var i = 0; i < topSongArray.length; i++) {
                    if(i > 0) topSongString += " , ";
                    topSongString += "   (" + topSongArray[i].votes + ") " + topSongArray[i].name;
                }

                $.say($.lang.get('songrequest.action.top', topSongString));
                
                // if (poll.hasTie) {
                //     $.say($.lang.get('pollsystem.results.lastpoll', poll.question, poll.votes.length, "Tie!", poll.options.join(', '), poll.counts.join(', ')));
                // } else {
                //     $.say($.lang.get('pollsystem.results.lastpoll', poll.question, poll.votes.length, poll.result, poll.options.join(', '), poll.counts.join(', ')));
                // }
            } else if (action.equalsIgnoreCase('new')) {
                if(requests.history.length == 0) {
                    $.say($.lang.get('songrequest.norequests'));
                    return;
                }

                var recentHistory = getRecentHistory(5);
                var newsongs = ""
                for (var i = 0; i < recentHistory.length; i++) {
                    if(i > 0) newsongs += " , ";
                    var song = recentHistory[i].song;
                    newsongs += "  " + 
                        recentHistory[i].sender + 
                        " requested " + recentHistory[i].song +
                         " (" + requests.songs[recentHistory[i].songNameStd].votes +" total)"
                }
                $.say($.lang.get('songrequest.action.new', newsongs));
            } else if (action.equalsIgnoreCase('refresh')) {
                //refreshes overlay
                if (requests.areOpen) {
                    sendTopSongData();
                    sendRecentHistory();
                } else {
                    sendRequestsClosed();
                }
            } else if (action.equalsIgnoreCase('played')) {
                var songName = argsString.substring("played".length, argsString.length).trim()
                $.consoleLn("delete request: " + songName + " by " + sender)

                updateRequestPlayed(songName, sender);
            } else if (action.equalsIgnoreCase('delete')) {
                var songName = argsString.substring("delete".length, argsString.length).trim()
                $.consoleLn('parse: [' + songName + "]");
                updateRequestDelete(songName, sender);
            } else {
                $.say($.whisperPrefix(sender) + $.lang.get('songrequest.usage'));
            }
        }
    });

    /**
     * @event initReady
     */
    $.bind('initReady', function() {
        // `script` is the script path. IT HAS TO BE IN SCRIPTS
        // `command` is the command name without the `!` prefix.
        // `permission` is the group number. 0, 1, 2, 3, 4, 5, 6 and 7.
        // 0 is most restrictive, 7 is most permissive
        // These are also used for the permcom command.

        $.registerChatCommand('./custom/songRequestSystem.js', 'request', 7);
        $.registerChatCommand('./custom/songRequestSystem.js', 'songrequests', 7);
        $.registerChatSubcommand('songrequests', 'top', 7);
        $.registerChatSubcommand('songrequests', 'new', 7);

        //Priv commands
        $.registerChatSubcommand('songrequests', 'open', 2);
        $.registerChatSubcommand('songrequests', 'close', 2);
        $.registerChatSubcommand('songrequests', 'played', 2);
        $.registerChatSubcommand('songrequests', 'delete', 2);
        $.registerChatSubcommand('songrequests', 'reset', 2);
        $.registerChatSubcommand('songrequests', 'refresh', 2);

        $.registerChatCommand('./custom/songRequestSystem.js', 'dbtest', 2);
    });

    //TODO: WTF?
    // /** Export functions to API */
    // $.poll = {
    //     runPoll: runPoll,
    //     endPoll: endPoll
    // };
})();
