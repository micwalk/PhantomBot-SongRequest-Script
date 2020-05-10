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
    var webSocket = new ReconnectingWebSocket((getProtocol() === 'https://' || window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws/panel', null, { reconnectInterval: 500 }),
        localConfigs = getQueryMap(),
        chart,
        songColorMap = {};

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
     * @function Used to send messages to the socket. This should be private to this script.
     *
     * @param {Object} message
     */
    const sendToSocket = function(message) {
        try {
            let json = JSON.stringify(message);

            webSocket.send(json);

            // Make sure to not show the user's token.
            if (json.indexOf('authenticate') !== -1) {
                logSuccess('sendToSocket:: ' + json.substring(0, json.length - 20) + '.."}');
            } else {
                logSuccess('sendToSocket:: ' + json);
            }
        } catch (e) {
            logError('Failed to send message to socket: ' + e.message);
        }
    };

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
     * @function Used to log things in the console.
     */
    const logSuccess = function(message) {
        console.log('%c[PhantomBot Log]', 'color: #6441a5; font-weight: 900;', message);
    };

    /*
     * @function Used to log things in the console.
     */
    const logError = function(message) {
        console.log('%c[PhantomBot Error]', 'color: red; font-weight: 900;', message);
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

    /*
     * @function Function that gets data for our chart.
     *
     * @param obj The object of data
     * @param updateColor If the chart colors should be updated.
     * @return The config.
     */
    const getChartConfig = function(obj, updateColor = true) {

        let parsedData = JSON.parse(obj.data);
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
                    'backgroundColor': []
                }],
                'labels': [],
            },
            'options': {
                'responsive': true,
                'scales': {
                    'xAxes':[{
                        display: true,
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


        //insert missing songs into color map
        //Generate random colors for each song name
        parsedData.forEach(songdata => {
            if(!songColorMap.hasOwnProperty(songdata.name)){
                songColorMap[songdata.name] = getRandomRGB();
            }
        })

        // Add the data only for top things
        parsedData.slice(0,maxDisplaySongs).map(songdata => {
            //TODO: add id
            config.data.labels.push(songdata.name); //+ ' (#' + json.id++ + ')'
            config.data.datasets[0].data.push(parseInt(songdata.votes));
            
            config.data.datasets[0].backgroundColor.push(songColorMap[songdata.name]);
        });

        return config;
    };

    /*
     * @function Functions that creates our chart.
     *
     * @param obj The object of data
     * @param slideFrom The option where to slide it from, left, right, top, bottom.
     */
    const createChart = function(obj, slideFrom = 'right') {
        const poll = $('.requests'),
            height = $(window).height(),
            width = $(window).width();

        // Update height and stuff.
        poll.height(height);
        poll.width(width);

        $('.container').css({
            'margin-left': -(width / 2),
            'margin-top': -(height / 2)
        });

        // Show the chart.
        poll.toggle('slide', {
            'direction': slideFrom
        }, 1e3);

        // Make the chart.
        chart = new Chart(poll.get(0).getContext('2d'), getChartConfig(obj));

        chart.update();
    };

    /*
     * @function Functions that deletes our chart.
     *
     * @param slideFrom The option where to slide it from, left, right, top, bottom.
     */
    const disposeChart = function(slideFrom = 'right') {
        $('.requests').toggle('slide', {
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

        chart.options.plugins = config.options.plugins;

        let dataLen = chart.data.datasets[0].data.length;
        let colorLen = chart.data.datasets[0].backgroundColor.length;
        if(dataLen > colorLen) { // if probs redundant with for below, but keeping for clarity
            for(i = 0; i < dataLen - colorLen; i++) {
                chart.data.datasets[0].backgroundColor.push(getRandomRGB());
            }
        }
        chart.update();
    };

    

    // WebSocket events.

    /*
     * @function Called when the socket opens.
     */
    webSocket.onopen = function() {
        logSuccess('Connection established with the websocket.');

        // Auth with the socket.
        sendToSocket({
            authenticate: getAuth()
        });
    };

    /*
     * @function Socket calls when it closes
     */
    webSocket.onclose = function() {
        logError('Connection lost with the websocket.');
    };

    /*
     * @function Called when we get a message.
     *
     * @param {Object} e
     */
    webSocket.onmessage = function(e) {
        try {
            console.log("got websocket with data");
            console.log(e);

            // Handle PING/PONG
            if (e.data == 'PING') {
                webSocket.send('PONG');
                return;
            }

            let rawMessage = e.data,
                message = JSON.parse(rawMessage);

            if (!message.hasOwnProperty('query_id')) { //query_id is used in responses from db requests
                // Check for our auth result.
                if (message.hasOwnProperty('authresult')) {
                    if (message.authresult === 'true') {
                        logSuccess('Successfully authenticated with the socket.');
                    } else {
                        logError('Failed to authenticate with the socket.');
                    }
                } else if(message.hasOwnProperty('eventFamily') && message['eventFamily'] == 'requests') {
                    // Handle request related stuff
                    if(message['eventType'] == 'requests_opened') {
                        console.log("requests opened!")
                        //start showing requests
                        //create chart
                        createChart(message, getOptionSetting('slideFromOpen', 'right'));

                    }

                    if(message['eventType'] == 'requests_closed') {
                        console.log("requests closed!")
                        //hide requests
                        //dispose chart
                        disposeChart(getOptionSetting('slideFromClose', 'right'));

                    }
                    
                    //TODO: split this in half
                    if(message['eventType'] == 'request_made') {
                        console.log("new request!")
                        //handle request made
                        updateChart(message);

                    }
                }
            }
        } catch (ex) {
            logError('Error while parsing socket message: ' + ex.message);
            logError('Message: ' + e.data);
        }
    };
});
