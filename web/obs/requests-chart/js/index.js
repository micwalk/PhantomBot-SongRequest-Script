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

// Main stuff.
$(function() {
    var localConfigs = getQueryMap(),
        chart,
        songColorMap = {};

    var socket = window.socket;

    var maxDisplaySongs = 8;

    /*
     * @function Gets an map/object/dict of the URL query parameters
     */
    function getQueryMap() {
        let queryString = window.location.search, // Query string that starts with ?
            queryParts = queryString.substr(1).split('&'), // Split at each &, which is a new query.
            queryMap = new Map(); // Create a new map for save our keys and values.

        for (let i = 0; i < queryParts.length; i++) {
            let key = queryParts[i].substr(0, queryParts[i].indexOf('=')),
                value = queryParts[i].substr(queryParts[i].indexOf('=') + 1, queryParts[i].length);

            if (key.length > 0 && value.length > 0) {
                queryMap.set(key.toLowerCase(), value);
            }
        }

        return queryMap;
    }

    /*
     * @function Checks if the query map has the option, if not, returns default.
     *
     * @param  {String} option
     * @param  {String} def
     * @return {String}
     */
    const getOptionSetting = function(option, def) {
        option = option.toLowerCase();

        if (localConfigs.has(option)) {
            return localConfigs.get(option);
        } else {
            return def;
        }
    };

    /*
     * @function Gets a random RGB color.
     *
     * @see Thanks: https://stackoverflow.com/a/10020716/8005692
     */
    const getRandomRGB = function() {
        let maximum = 255,
            minimum = 100,
            range = (maximum - minimum),
            red = (Math.floor(Math.random() * range) + minimum),
            green = (Math.floor(Math.random() * range) + minimum),
            blue = (Math.floor(Math.random() * range) + minimum);

        return 'rgb(' + red + ', ' + green + ', ' + blue + ')';
    };

    function getOrPickSongColor(songName) {
        if(!songColorMap.hasOwnProperty(songName)){
            songColorMap[songName] = getRandomRGB();
        }
        return songColorMap[songName];
    }

    /*
     * @function Function that gets data for our chart.
     *
     * @param parsedData The parsed chart data
     * @param updateColor If the chart colors should be updated.
     * @return The config.
     */
    const getChartConfig = function(parsedData, updateColor = true) {
        let totalVotes = parsedData.map(json => {return parseInt(json.votes)}).reduce((a, b) => a + b, 0)

        //Target state:
        //One dataset with votes
        //one label per song
        //orer high to low
        //must be able to update labels.
        //show labels
        const config = {
            'type': 'horizontalBar',
            'data': {
                'datasets': [{
                    'data': [],
                    'backgroundColor': [],
                    'barThickness': 1,
                    'maxBarThickness': 2,
                    'minBarLength': 2,
                }],
                'labels': [],
            },
            'options': {
                'responsive': true,
                maintainAspectRatio: false,
                'scales': {
                    'xAxes':[{
                        display: false,
                        ticks:{
                            fontSize: 20,
                            beginAtZero: true,
                            min: 0
                        }
                    }],
                    'yAxes':[{
                        display: false,
                        ticks:{
                            'color': '#000',
                            fontStyle: 'bold',
                            fontSize: 30,
                        }
                    }]
                },
                'tooltips': {
                    'enabled': true
                },
                'legend': {
                    'display' : false
                },
                'title': {
                    'display': true,
                    'fontSize': 35,
                    'fontColor': 'black',
                    'text': 'Top Song Requests'
                },
                'layout': {
                    padding: {
                        left: 10,
                        right: 0,
                        top: 0,
                        bottom: 0
                    }
                },
                'plugins': {
                    'datalabels': {
                        'anchor' : 'center',
                        'clamp' : 'true',
                        'color': '#000',
                        'font': {
                            'size': 30
                        },
                        'formatter': (value, ctx) => {
                            if (value > 0) {
                                //return value + "  (" + ((value * 100 / totalVotes).toFixed(0) + '%)');
                                //return value + " requests";
                                return ctx.chart.data.labels[ctx.dataIndex] + " - " + value;
                            } else {
                                return 'No Votes';
                            }
                        }
                    }
                }
            }
        };

        // Add the data only for top things
        parsedData.slice(0,maxDisplaySongs).map(songdata => {
            //TODO: add id
            config.data.labels.push(songdata.name); //+ ' (#' + json.id++ + ')'
            config.data.datasets[0].data.push(parseInt(songdata.votes));
            
            config.data.datasets[0].backgroundColor.push(getOrPickSongColor(songdata.name));
        });

        return config;
    };

    /*
     * @function Functions that creates our chart.
     *
     * @param obj The object of data
     * @param slideFrom The option where to slide it from, left, right, top, bottom.
     */
    const createChart = function(parseObj, slideFrom = 'right') {
        const requestsDiv = $('.requests');
            // height = $(window).height(),
            // width = $(window).width();

        // Update height and stuff.
        // requestsDiv.height(height);
        // requestsDiv.width(width);

        // $('.container').css({
        //     'margin-left': -(width / 2),
        //     'margin-top': -(height / 2)
        // });

        // Show the chart.
        $('.container').toggle('slide', {
            'direction': slideFrom
        }, 1e3);

        // Make the chart.
        chart = new Chart(requestsDiv.get(0).getContext('2d'), getChartConfig(parseObj));

        chart.update();
    };

    /*
     * @function Functions that deletes our chart.
     *
     * @param slideFrom The option where to slide it from, left, right, top, bottom.
     */
    const disposeChart = function(slideFrom = 'right') {
        $('.container').toggle('slide', {
            'direction': slideFrom
        }, 1e3, () => window.location.reload());
    };

    /*
     * @function Updates our chart.
     *
     * @param obj The object of data
     */
    const updateChart = function(obj) {
        if(chart === undefined) {
            createChart(obj, getOptionSetting('slideFromOpen', 'right'));
            return;
        }

        const config = getChartConfig(obj, false);

        chart.data.labels = config.data.labels;
        chart.data.datasets[0].data = config.data.datasets[0].data;
        chart.data.datasets[0].backgroundColor = config.data.datasets[0].backgroundColor;

        chart.options.plugins = config.options.plugins;

        chart.update();
    };

    var lastHistList = [];
    const updateHistory = function(historyList) {
            //historylist should have fields:
            // sender
            // song -- display name
            // songNameRaw --lookup name,
            // time - time as int

            var stillPresentIds = historyList.map(h => h.requestId);
            var existingIds = [];
            $("#recentlist li").each((i, e) => {
                var existId = parseInt($(e).attr('histid'));
                if(stillPresentIds.includes(existId)) {
                    existingIds.push(existId);
                } else {
                    //hide then remove it after delay
                    $(e).removeClass("show");
                    setTimeout(function() { $(e).remove(); }, 10000);
                }
            })

            historyList.reverse().forEach(function(h) {
                if(existingIds.includes(h.requestId)) return; // no need
                //else it is new
                var colorLookup = getOrPickSongColor(h.song)

                var newListElt = document.createElement('li')
                newListElt.innerHTML = h.sender + ": " + h.song
                $(newListElt).addClass("waiting");
                $(newListElt).attr("histid", h.requestId)
                $(newListElt).css("background", colorLookup);

                $("#recentlist").prepend(newListElt);

                setTimeout(function() {
                    $(newListElt).addClass('show').removeClass('waiting');
                }, 10);
            })

            

            lastHistList = historyList;
    }

    function updateUiFromDb() {
        socket.getDBValue("db_hist_query", 'request_data', 'last_request_history', function(response) {
            console.log("got resposne from db! for hist list!")
            console.log(response);
            
            updateHistory(JSON.parse(response.request_data));
        })

        socket.getDBValue("db_top_query", 'request_data', 'last_top_songs', function(response) {
            console.log("got resposne from db! for top list!")
            console.log(response);

            updateChart(JSON.parse(response.request_data));
            
        })
    }
    /*
     * @function Called when we get a message.
     *
     * @param {Object} e
     */
    const handleSocketMessage = function(e) {
        try {
            console.log("got websocket with data");
            console.log(e);


            let rawMessage = e.data,
                message = JSON.parse(rawMessage);

                if(message.hasOwnProperty('eventFamily') && message['eventFamily'] == 'requests') {
                    // Handle request related stuff
                    if(message['eventType'] == 'requests_closed') {
                        console.log("requests closed!")
                        //hide requests
                        //dispose chart
                        disposeChart(getOptionSetting('slideFromClose', 'right'));
                    } else if(message['eventType'] == 'top_songs') {
                        console.log("Update for top songs!")
                        updateChart(JSON.parse(message.data));
                    } else if(message['eventType'] == "request_history"){
                        console.log("Update of request history!")
                        updateHistory(JSON.parse(message.data));
                    }  else if(message['eventType'] == "db_test"){
                        console.log("Update dem db bro!")
                        updateUiFromDb();
                    }
                }
            
        } catch (ex) {
            logError('Error while parsing socket message: ' + ex.message);
            logError('Message: ' + e.data);
        }
    };

    // WebSocket events.
    socket.addFamilyHandler("requests", handleSocketMessage);

    const TryInitData = function () {
        if (socket) {
            //if socket is connecting wait 500ms to retry send the message
            let rdy = socket.getReadyState();
            if(rdy === 0){
                console.log("waiting for socket to connect")
                setTimeout(()=>TryInitData(),500);
                return;
            }
            updateUiFromDb();
        } else {
            throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
        }
    };

    $( document ).ready(function() {
        TryInitData();
    });

});
