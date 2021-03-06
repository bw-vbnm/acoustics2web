angular.module('Beats.filters', [])

// A filter that takes a number of seconds and converts it to MM:SS format
.filter('momentFormat', function()
{
    return function(input)
    {
        var seconds = (Math.floor(input) % 60);
        if (seconds < 10)
        {
            seconds = "0" + seconds;
        }
        return Math.floor(input / 60) + ":" + seconds;
    };
});

angular.module('BeatsApp', ['Beats.filters', 'ngCookies'])
.directive('takeFocus', function($timeout)
{
    // Directive used to focus on an element when the variable under takeFocus becomes true
    return {
        link: function(scope, element, attrs)
        {
            // Watch the variable under takeFocus
            scope.$watch(attrs.takeFocus, function(value)
            {
                // We should take focus to this element
                if (value === true)
                {
                    // A tiny timeout is required for the element to be rendered and be able to take
                    // focus
                    $timeout(function()
                    {
                        element[0].focus();
                        // Reset the focus variable so this action can be repeated
                        scope[attrs.takeFocus] = false;
                    });
                }
            });
        }
    };
})
.directive('barControl', function()
{
    // Directive for having bar slider based input controls
    return {
        link: function(scope, element, attrs)
        {
            // Get the parameters that determine how to set the value
            var barMin = attrs.barMin | 0;
            var barMax = attrs.barMax | 0;

            var dragging = false;

            var handleDragging = function(event)
            {
                if (dragging)
                {
                    // Prevent browser's default dragging behaviour
                    event.preventDefault();

                    // Determine ratio from 0 to 1 over the control
                    var ratioX = (event.clientX - element[0].offsetLeft) / (element[0].offsetWidth);

                    // Linearly map that ratio to between barMax and barMin
                    scope[attrs.barControl] = ratioX * (barMax - barMin) + barMin;
                    if (scope[attrs.barControl] < barMin)
                    {
                        scope[attrs.barControl] = barMin;
                    }
                    if (scope[attrs.barControl] > barMax)
                    {
                        scope[attrs.barControl] = barMax;
                    }

                    // Update the view
                    scope.$digest();
                }
            };

            var finishDragging = function()
            {
                if (dragging)
                {
                    // Call the callback for whenever the bar is set
                    scope.$eval(attrs.barSet);
                    dragging = false;

                    // Indicate that dragging has stopped
                    scope[attrs.barDragging] = false;
                }
            }

            element[0].addEventListener('mousedown', function(event)
            {
                dragging = true;

                // Indicate that dragging has started
                scope[attrs.barDragging] = true;

                handleDragging(event);
            });

            element[0].addEventListener('mouseup', finishDragging);
            element[0].addEventListener('mouseleave', finishDragging);
            element[0].addEventListener('mousemove', handleDragging);
        }
    };
})
.controller('BeatsController', ['$scope', '$http', '$interval', '$cookies', function($scope, $http, $interval, $cookies)
{
    var backendBase = 'http://127.0.0.1:5000'

    $scope.showLoginDialog = false;
    $scope.formUsername = '';
    $scope.formPassword = '';
    $scope.showYouTubeDialog = false;
    $scope.formYouTubeURL = '';

    $scope.loggedIn = null;
    $scope.playlist = [];
    $scope.albumlist = [];
    $scope.queue = [];
    $scope.volume = 0;
    $scope.holdVolumeUpdate = false;
    $scope.playbackTime = 0;
    $scope.playbackDuration = 0;
    $scope.isPlaying = false;
    $scope.layout = 'list';

    $scope.sections =
    [
        { title: 'Queue', icon: '\uf03a', query: '' },
        { title: 'Recently Added', icon: '\uf017', query: '' },
        { title: 'Recently Played', icon: '\uf04b', query: 'play-history' },
        { title: 'Random', icon: '\uf074', query: '' },
        { title: 'Top 100', icon: '\uf01b', query: 'top-songs:100' },
    ];

    $scope.playlists =
    [
        { title: 'Rock' },
        { title: 'Pop' },
        { title: 'Top 40' },
        { title: 'Hardcore' },
        { title: 'Witch-Hop' },
    ];

    $scope.isShowingDialog = function()
    {
        return $scope.showLoginDialog || $scope.showYouTubeDialog;
    };

    $scope.startYouTubeDialog = function()
    {
        if (!$scope.ensureLogin())
        {
            return;
        }
        $scope.formYouTubeURL = '';
        $scope.showYouTubeDialog = true;
        $scope.youTubeFocus = true;
    };

    $scope.hideYouTubeDialog = function()
    {
        $scope.showYouTubeDialog = false;
    };

    $scope.playYouTube = function(url)
    {
        $scope.hideYouTubeDialog();
        if (!$scope.ensureLogin()) {
            return;
        }

        $http.post(backendBase + '/v1/queue/add', 'url=' + encodeURIComponent(url) + '&token=' + $cookies['crowd.token_key'],
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

    };

    $scope.login = function(username, password)
    {
        $scope.hideLoginDialog();
        $http.post(backendBase + '/v1/session', 'username=' + username + '&password=' + password,
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        .success(function(data)
        {
            $cookies['crowd.token_key'] = data['token'];
            $scope.requestUser();
        });
    };

    $scope.logout = function()
    {
        $http.delete(backendBase + '/v1/session/' + $cookies['crowd.token_key'])
        .success(function(data)
        {
            delete $cookies['crowd.token_key'];
            $scope.loggedIn = null;
        });
    };

    $scope.ensureLogin = function()
    {
        if (!$cookies['crowd.token_key']) {
            $scope.showLoginDialog = true;
            $scope.usernameFocus = true;
            return false;
        }
        return true;
    };

    $scope.hideLoginDialog = function()
    {
        $scope.formUsername = '';
        $scope.formPassword = '';
        $scope.showLoginDialog = false;
    }

    $scope.requestUser = function()
    {
        $http.get(backendBase + '/v1/session/' + $cookies['crowd.token_key'])
        .success(function(data)
        {
            $scope.loggedIn = data.user;
        })
        .error(function(data, status)
        {
            // Session expired
            delete $cookies['crowd.token_key'];
        });
    };

    if ($cookies['crowd.token_key'])
    {
        $scope.requestUser();
    }

    $scope.searchSongs = function(query)
    {
        if (!query) {
            $scope.randomSongs();
            return;
        }
        $http.get(backendBase + '/v1/songs/search',
        {
            params: { 'q': query }
        })
        .success(function(data)
        {
            // album search
            if (query.substring(0,7) == "artist:")
            {
                var albums = [];
                for (var resultIndex = 0; resultIndex < data.results.length; resultIndex++)
                {
                    var result = data.results[resultIndex];
                    albums[resultIndex] = result;
                }
                $scope.albumlist = albums;
                $scope.layout = 'albumgrid';
                $scope.searchText = query;
            } 
            else
            {
                var songs = [];
                for (var resultIndex = 0; resultIndex < data.results.length; resultIndex++)
                {
                    var result = data.results[resultIndex];
                    songs[resultIndex] = result;
                }
                $scope.playlist = songs;
                $scope.layout = 'songlist';
                $scope.searchText = query;
            }
        });
    }

    $scope.randomSongs = function()
    {
        $http.get(backendBase + '/v1/songs/random')
        .success(function(data)
        {
            var songs = [];
            for (var resultIndex = 0; resultIndex < data.results.length; resultIndex++)
            {
                var result = data.results[resultIndex];
                songs[resultIndex] = result;
            }
            $scope.playlist = songs;
            $scope.layout = 'songlist';
            $scope.searchText = '';
        });
    }

    $scope.randomSongs();

    $scope.setVolume = function(volume)
    {
        // Set the volume on the client and send it to the server
        if (!$scope.ensureLogin()) {
            return;
        }

        $scope.volume = Math.round(volume); // Because of the bar control, this may be a fraction
        $http.post(backendBase + '/v1/player/volume', 'volume=' + $scope.volume + '&token=' + $cookies['crowd.token_key'],
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    };

    $scope.voteSong = function(song)
    {
        if (!$scope.ensureLogin()) {
            return;
        }

        $http.post(backendBase + '/v1/queue/add', 'id=' + song.id + '&token=' + $cookies['crowd.token_key'],
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    };

    $scope.pauseSong = function()
    {
        if (!$scope.ensureLogin()) {
            return;
        }
        $http.post(backendBase + '/v1/player/pause', 'token=' + $cookies['crowd.token_key'],
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    };

    $scope.skipSong = function()
    {
        if (!$scope.ensureLogin()) {
            return;
        }
        $http.post(backendBase + '/v1/player/play_next', 'token=' + $cookies['crowd.token_key'],
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    };

    $interval(function()
    {
        $http.get(backendBase + '/v1/now_playing')
        .success(function(data)
        {
            if (data['media']) {
                $scope.playbackTime = data['player_status']['current_time'] / 1000;
                $scope.playbackDuration = data['player_status']['duration'] / 1000;
            }
            else {
                $scope.playbackTime = 0;
                $scope.playbackDuration = 0;
            }
            // Prevent setting the volume while the user is changing it
            if (!$scope.holdVolumeUpdate)
            {
                $scope.volume = data['player_status']['volume'];
            }
            $scope.isPlaying = data['player_status']['state'] == "State.Playing";
        });

        var params = {};
        if ($scope.loggedIn)
        {
            params['user'] = $scope.loggedIn['name'];
        }
        $http.get(backendBase + '/v1/queue',
        {
            params: params
        })
        .success(function(data)
        {
            $scope.queue = data['queue'].slice(data['position']);
        });
    }, 1000);
}]);