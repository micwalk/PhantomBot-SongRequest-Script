/*
 * Copyright (C) 2016-2019 phantombot.tv
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * pollSystem.js
 *
 * This module enables the channel owner to start/manage polls
 * Start/stop polls is exported to $.poll for use in other scripts
 */
(function() {

    
    var requests = {
        areOpen: false,
        songs: {},
        history: [],
        playedSongs: []
    }

    var nextSongId = 0; //global for how to make song ids (static variable ideally)
    function Song(name, displayName) {
        this.songName  = name;
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

    function getRecentHistory(maxHistory) {
        var shortHistory = requests.history.slice(requests.history.length-maxHistory, requests.history.length);
        return shortHistory.reverse();
    }
    
    //Sends top song data to the web socket
    function sendTopSongData(eventType) {
        $.panelsocketserver.sendJSONToAll(JSON.stringify({
            'eventFamily': 'requests',
            'eventType': eventType,
            'data': JSON.stringify(getTopRequests())
        }));
    }
    
    //Sends top song data to the web socket
    function sendRecentHistory() {
        $.panelsocketserver.sendJSONToAll(JSON.stringify({
            'eventFamily': 'requests',
            'eventType': 'request_history',
            'data': JSON.stringify(getRecentHistory(5))
        }));
    }

    function sendRequestsClosed() {
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

        sendTopSongData('requests_opened');
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
        sendTopSongData("request_made") //reuse request_made for now
    }


     /**
     * @function makeRequest
     * @param {string} sender
     * @param {string} voteText
     */
    function makeRequest(sender, songName) {
        if (!requests.areOpen) {
            $.say($.whisperPrefix(sender) + $.lang.get('songrequest.request.notopen'));
            return;
        }

        //lookup song
        
        var cleanSongName = songName.toLowerCase(); //TODO: Clean me more?
        
        //TODO: validate song name and reject (length? injection? profanity?)
        var songInvalid = cleanSongName.length > 30;
        if(songInvalid) {
            $.say($.whisperPrefix(sender) + $.lang.get('songrequest.reject.length', songName));
            return;
        }

        //Retrieve current song data, or insert if it does not exist
        if(hasKey(Object.keys(requests.songs), cleanSongName)) {
            var currentSong = requests.songs[cleanSongName];
            if (hasKey(currentSong.voters, sender.toLowerCase())) {
                $.say($.whisperPrefix(sender) + $.lang.get('songrequest.request.already'));
                return;
            }    
        } else {
            //Make new song and insert
            var currentSong = new Song(cleanSongName, songName);
            requests.songs[cleanSongName] = currentSong;
        }

        currentSong.voters.push(sender);
        currentSong.votes++;

        //TODO: Actual time here
        requests.history.push({sender: sender, song: cleanSongName, songNameRaw: songName, time: (new Date()).getTime()});

        $.say($.whisperPrefix(sender) + $.lang.get('songrequest.request.accepted', cleanSongName, currentSong.votes));

        

        //Send data to overlay UI
        //TODO: send two events -- history and total
        sendTopSongData('request_made');

        return true;
        ////This snippet sent data to the websocket the UI is listening on
        // $.panelsocketserver.sendJSONToAll(JSON.stringify({
        //     'new_vote': 'true',
        //     'data': JSON.stringify(objOBS)
        // }));
        ////Who knows what inidb was used for.
        //Used in web\panel\js\pages\extra\poll.js
        //So the main control UI not the overlay UI
        // $.inidb.incr('pollVotes', poll.options[optionIndex], 1);
    };

    /**
     * @event command
     */
    $.bind('command', function(event) {
        var sender = event.getSender().toLowerCase(),
            command = event.getCommand(),
            argsString = event.getArguments().trim(),
            args = event.getArgs(),
            action = args[0];

        
        // if (command.equalsIgnoreCase('vote') && action !== undefined) {
        //     if (poll.pollRunning) {
        //         vote(sender, action);
        //     }
        // }
        
        if (command.equalsIgnoreCase('request') ) {//&& argsString.length > 0
            // $.say($.whisperPrefix(sender) + "attempting request for " + argsString);
            var requestAccepted = makeRequest(sender, argsString + ""); //+"" to cast as js string
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
                    $.say($.whisperPrefix(sender) + $.lang.get('songrequest.defaultaction.open', ' Use "!songrequests [top | new]" to see requests.'));
                } else {
                    $.say($.whisperPrefix(sender) + $.lang.get('songrequest.defaultaction.closed'));
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
                        " requested " + recentHistory[i].songNameRaw +
                         " (" + requests.songs[recentHistory[i].song].votes +" total)"
                }
                $.say($.lang.get('songrequest.action.new', newsongs));
            } else if (action.equalsIgnoreCase('refresh')) {
                //refreshes overlay
                if (requests.areOpen) {
                    sendTopSongData("request_made");//re-use request_made aain
                } else {
                    sendRequestsClosed();
                }
            } else if (action.equalsIgnoreCase('played')) {
                $.say('TODO: Implement played command');
            } else if (action.equalsIgnoreCase('delete')) {
                $.say('TODO: Implement delete command');
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
    });

    //TODO: WTF?
    // /** Export functions to API */
    // $.poll = {
    //     runPoll: runPoll,
    //     endPoll: endPoll
    // };
})();