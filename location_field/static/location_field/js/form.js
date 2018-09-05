!function($){
    var LocationFieldCache = {
        load: [],
        onload: {},

        isLoading: false
    };

    var LocationFieldResourceLoader;

    $.locationField = function(options) {
        var LocationField = {
            options: $.extend({
                provider: 'google',
                providerOptions: {
                    google: {
                        api: '//maps.google.com/maps/api/js',
                        mapType: 'ROADMAP'
                    }
                },
                searchProvider: 'google',
                id: 'map',
                latLng: '0,0',
                autocomplete: false,
                autocompleteOptions: {},
                searchBox: null,
                mapOptions: {
                    zoom: 9
                },
                basedFields: $(),
                updateFields: {},
                inputField: $(),
                suffix: '',
                path: '',
                fixMarker: true
            }, options),

            autocomplete: null,

            providers: /google|openstreetmap|mapbox/,
            searchProviders: /google/,

            render: function() {
                this.$id = $('#' + this.options.id);

                if ( ! this.providers.test(this.options.provider)) {
                    this.error('render failed, invalid map provider: ' + this.options.provider);
                    return;
                }

                if ( ! this.searchProviders.test(this.options.searchProvider)) {
                    this.error('render failed, invalid search provider: ' + this.options.searchProvider);
                    return;
                }

                var self = this;

                this.loadAll(function(){
                    var mapOptions = self._getMapOptions(),
                        map = self._getMap(mapOptions);
        
                    var marker = self._getMarker(map, mapOptions.center);

                    // fix issue w/ marker not appearing
                    if (self.options.provider == 'google' && self.options.fixMarker)
                        self.__fixMarker();

                    // watch based fields
                    if (self.options.autocomplete) {
                        self._initAutocomplete(map, marker, self.options);
                    } else {
                        self._watchBasedFields(map, marker);
                    }
                });
            },

            fill: function(latLng) {
                this.options.inputField.val(latLng.lat + ',' + latLng.lng);
            },

            initFields: function(fields, val) {
                fields.forEach(function(name){
                    var el = $('*[name='+name+']');
                    el.val(val);
                });
            },

            updateValues: function(values) {
                Object.keys(values).forEach(function(name){
                    var el = $('*[name='+name+']');
                    el.val(values[name]);
                    if (el.get(0).tagName.toLowerCase() === 'select') {
                        el.trigger('change');
                    }
                });
            },
            // default callback for search
            updateLocation: function(place, map, marker) {
                if (!place.geometry) {
                    return;
                }

                var details = {
                  'locality': 'city',
                  'administrative_area_level_1': 'state',
                  'country': 'country',
                  'postal_code': 'zip_code',
                };

                var values = {};
                this.initFields(Object.values(details));

                var city, state, country;

                var keys = Object.keys(details);
                for (let i=0; i<place.address_components.length; i++) {
                    for (let j=0; j<keys.length; j++) {
                        if (place.address_components[i].types.indexOf(keys[j]) !== -1) {
                            values[details[keys[j]]] = place.address_components[i].long_name;
                        }
                    }
                }

                this.updateValues(values);

                var latLng = new L.LatLng(place.geometry.location.lat(), place.geometry.location.lng());
                map.panTo(latLng);
                marker.setLatLng(latLng);
            },

            search: function(map, marker, address) {
                var googleGeocodeProvider = new L.GeoSearch.Provider.Google();

                googleGeocodeProvider.GetLocations(address, function(data) {
                    if (data.length > 0) {
                        var result = data[0],
                            latLng = new L.LatLng(result.Y, result.X);

                        marker.setLatLng(latLng);
                        map.panTo(latLng);
                    }
                });
            },

            loadAll: function(onload) {
                this.$id.html('Loading...');

                // resource loader
                if (LocationFieldResourceLoader == undefined)
                    LocationFieldResourceLoader = SequentialLoader();

                this.load.loader = LocationFieldResourceLoader;
                this.load.path = this.options.path;

                var self = this;

                this.load.common(function(){
                    var mapProvider = self.options.provider,
                        onLoadMapProvider = function() {
                            var searchProvider = self.options.searchProvider + 'SearchProvider',
                                onLoadSearchProvider = function() {
                                    self.$id.html('');
                                    onload();
                                };

                            if (self.load[searchProvider] != undefined) {
                                self.load[searchProvider](self.options.providerOptions[self.options.searchProvider] || {}, onLoadSearchProvider);
                            }
                            else {
                                onLoadSearchProvider();
                            }
                        };

                    if (self.load[mapProvider] != undefined) {
                        self.load[mapProvider](self.options.providerOptions[mapProvider] || {}, onLoadMapProvider);
                    }
                    else {
                        onLoadMapProvider();
                    }
                });
            },

            load: {
                    google: function(options, onload) {
                        var url = options.api;

                        if (typeof options.apiKey !== 'undefined') {
                            url += url.indexOf('?') === -1 ? '?' : '&';
                            url += 'key=' + options.apiKey;
                        }

                        var js = [
                            url,
                            this.path + '/leaflet-google.js'
                        ];

                    this._loadJSList(js, onload);
                },

                googleSearchProvider: function(options, onload) {
                    var self = this;
                    var url = options.api;

                    if (typeof options.apiKey !== 'undefined') {
                        url += url.indexOf('?') === -1 ? '?' : '&';
                        url += 'key=' + options.apiKey;
                    }

                    var js = [
                            url,
                            this.path + '/l.geosearch.provider.google.js'
                        ];

                    this._loadJSList(js, function(){
                        // https://github.com/smeijer/L.GeoSearch/issues/57#issuecomment-148393974
                        L.GeoSearch.Provider.Google.Geocoder = new google.maps.Geocoder();

                        onload();
                    });
                },

                mapbox: function(options, onload) {
                    onload();
                },

                openstreetmap: function(options, onload) {
                    onload();
                },

                common: function(onload) {
                    var self = this,
                        js = [
                            // map providers
                            this.path + '/leaflet.js',
                            // search providers
                            this.path + '/l.control.geosearch.js',
                        ],
                        css = [
                            // map providers
                            this.path + '/leaflet.css'
                        ];

                    this._loadJSList(js, function(){
                        self._loadCSSList(css, onload);
                    });
                },

                _loadJS: function(src, onload) {
                    this.loader.loadJS(src, onload);
                },

                _loadJSList: function(srclist, onload) {
                    this.__loadList(this._loadJS, srclist, onload);
                },

                _loadCSS: function(src, onload) {
                    if (LocationFieldCache.onload[src] != undefined) {
                        onload();
                    }
                    else {
                        LocationFieldCache.onload[src] = 1;
                        onloadCSS(loadCSS(src), onload);
                    }
                },

                _loadCSSList: function(srclist, onload) {
                    this.__loadList(this._loadCSS, srclist, onload);
                },

                __loadList: function(fn, srclist, onload) {
                    if (srclist.length > 1) {
                        for (var i = 0; i < srclist.length-1; ++i) {
                            fn.call(this, srclist[i], function(){});
                        }
                    }

                    fn.call(this, srclist[srclist.length-1], onload);
                }
            },

            error: function(message) {
                console.log(message);
                this.$id.html(message);
            },


            _initAutocomplete: function(map, marker, options) {
                var self = this;
                if (options.provider == 'google') {
                    var searchBox;
                    if (options.searchBox) {
                      searchBox = document.getElementById(options.searchBox);
                    } else if (options.basedFields.length != 0) {
                      searchBox = options.basedFields[0];
                    }
                    this.autocomplete = new google.maps.places.Autocomplete(searchBox, options.autocompleteOptions);
                    google.maps.event.addListener(this.autocomplete, "place_changed", function () {
                        self.updateLocation(self.autocomplete.getPlace(), map, marker);
                    });
                    google.maps.event.addDomListener(searchBox, 'keydown', function(event) { 
                      if (event.keyCode === 13) {
                        event.preventDefault();
                      }
                    });
                }
            },

            _getMap: function(mapOptions) {
                var map = new L.Map(this.options.id, mapOptions), layer;

                if (this.options.provider == 'google') {
                    layer = new L.Google(this.options.providerOptions.google.mapType);
                }
                else if (this.options.provider == 'openstreetmap') {
                    layer = new L.tileLayer(
                        'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            maxZoom: 18
                        });
                }
                else if (this.options.provider == 'mapbox') {
                    layer = new L.tileLayer(
                        'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
                            maxZoom: 18,
                            accessToken: this.options.providerOptions.mapbox.access_token,
                            id: 'mapbox.streets'
                        });
                }

                map.addLayer(layer);

                return map;
            },

            _getMapOptions: function() {
                return $.extend(this.options.mapOptions, {
                    center: this._getLatLng()
                });
            },

            _getLatLng: function() {
                var l = this.options.latLng.split(',').map(parseFloat);
                return new L.LatLng(l[0], l[1]);
            },

            _getMarker: function(map, center) {
                var self = this,
                    markerOptions = {
                        draggable: true
                    };

                var marker = L.marker(center, markerOptions).addTo(map);

                // fill input on dragend
                marker.on('dragend move', function(){
                    self.fill(this.getLatLng());
                });

                // place marker on map click
                map.on('click', function(e){
                    marker.setLatLng(e.latlng);
                });

                return marker;
            },

            _watchBasedFields: function(map, marker) {
                var self = this,
                    basedFields = this.options.basedFields,
                    onchangeTimer,
                    onchange = function() {
                        var values = basedFields.map(function() {
                            var value;
                            if (this.nodeName.toLowerCase() === 'select') {
                              value = $(this).children("option:selected" ).text();
                            } else {
                              value = $(this).val();
                            }
                            return value === '' ? null : value;
                        });
                        var address = values.toArray().join(', ');
                        clearTimeout(onchangeTimer);
                        onchangeTimer = setTimeout(function(){
                            self.search(map, marker, address);
                        }, 300);
                    };

                basedFields.each(function(){
                    var el = $(this);

                    if (el.is('select'))
                        el.change(onchange);
                    else
                        el.keyup(onchange);
                });
            },

            __fixMarker: function() {
                $('.leaflet-map-pane').css('z-index', '2 !important');
                $('.leaflet-google-layer').css('z-index', '1 !important');
            }
        }

        return {
            render: LocationField.render.bind(LocationField)
        }
    }

    $('input[data-location-field-options]:visible').livequery(function(){
        var el = $(this);

        if ( ! el.is(':visible'))
            return;

        if (el.hasClass('location-field-processed'))
            return;

        el.addClass('location-field-processed');

        var name = el.attr('name'),
            options = el.data('location-field-options'),
            basedFields = options.field_options.based_fields,
            pluginOptions = {
                updateFields: options.field_options.update_fields,
                id: 'map_' + name,
                inputField: el,
                latLng: el.parent().find(':text').val() || '0,0',
                suffix: options['search.suffix'],
                path: options['resources.root_path'],
                provider: options['map.provider'],
                searchProvider: options['search.provider'],
                autocomplete: options['autocomplete.enabled'],
                autocompleteOptions: options['autocomplete.options'],
                searchBox: options['autocomplete.field'],
                providerOptions: {
                    google: {
                        api: options['provider.google.api'],
                        apiKey: options['provider.google.api_key'],
                        mapType: options['provider.google.map_type']
                    },
                    mapbox: {
                        access_token: options['provider.mapbox.access_token']
                    }
                },
                mapOptions: {
                    zoom: options['map.zoom']
                }
            };

        // prefix
        var prefixNumber;

        try {
            prefixNumber = name.match(/-(\d+)-/)[1];
        } catch (e) {}

        if (prefixNumber != undefined && options.field_options.prefix) {
            var prefix = options.field_options.prefix.replace(/__prefix__/, prefixNumber);

            basedFields = basedFields.map(function(n){
                return prefix + n
            });
        }

        // based fields
        pluginOptions.basedFields = $(basedFields.map(function(n){
            return '#id_' + n
        }).join(','));

        // render
        $.locationField(pluginOptions).render();
    });

}(jQuery || django.jQuery);


var SequentialLoader = function() {
    var SL = {
        loadJS: function(src, onload) {
            //console.log(src);
            // add to pending list
            this._load_pending.push({'src': src, 'onload': onload});
            // check if not already loading
            if ( ! this._loading) {
                this._loading = true;
                // load first
                this.loadNextJS();
            }
        },

        loadNextJS: function() {
            // get next
            var next = this._load_pending.shift();
            if (next == undefined) {
                // nothing to load
                this._loading = false;
                return;
            }
            // check not loaded
            if (this._load_cache[next.src] != undefined) {
                next.onload();
                this.loadNextJS();
                return; // already loaded
            }
            else {
                this._load_cache[next.src] = 1;
            }
            // load
            var el = document.createElement('script');
            el.type = 'application/javascript';
            el.src = next.src;
            // onload callback
            var self = this;
            el.onload = function(){
                //console.log('Loaded: ' + next.src);
                // trigger onload
                next.onload();
                // try to load next
                self.loadNextJS();
            };
            document.body.appendChild(el);
        },

        _loading: false,
        _load_pending: [],
        _load_cache: {}
    };

    return {
        loadJS: SL.loadJS.bind(SL)
    }
};


/*!
loadCSS: load a CSS file asynchronously.
[c]2015 @scottjehl, Filament Group, Inc.
Licensed MIT
*/
(function(w){
	"use strict";
	/* exported loadCSS */
	var loadCSS = function( href, before, media ){
		// Arguments explained:
		// `href` [REQUIRED] is the URL for your CSS file.
		// `before` [OPTIONAL] is the element the script should use as a reference for injecting our stylesheet <link> before
			// By default, loadCSS attempts to inject the link after the last stylesheet or script in the DOM. However, you might desire a more specific location in your document.
		// `media` [OPTIONAL] is the media type or query of the stylesheet. By default it will be 'all'
		var doc = w.document;
		var ss = doc.createElement( "link" );
		var ref;
		if( before ){
			ref = before;
		}
		else {
			var refs = ( doc.body || doc.getElementsByTagName( "head" )[ 0 ] ).childNodes;
			ref = refs[ refs.length - 1];
		}

		var sheets = doc.styleSheets;
		ss.rel = "stylesheet";
		ss.href = href;
		// temporarily set media to something inapplicable to ensure it'll fetch without blocking render
		ss.media = "only x";

		// Inject link
			// Note: the ternary preserves the existing behavior of "before" argument, but we could choose to change the argument to "after" in a later release and standardize on ref.nextSibling for all refs
			// Note: `insertBefore` is used instead of `appendChild`, for safety re: http://www.paulirish.com/2011/surefire-dom-element-insertion/
		ref.parentNode.insertBefore( ss, ( before ? ref : ref.nextSibling ) );
		// A method (exposed on return object for external use) that mimics onload by polling until document.styleSheets until it includes the new sheet.
		var onloadcssdefined = function( cb ){
			var resolvedHref = ss.href;
			var i = sheets.length;
			while( i-- ){
				if( sheets[ i ].href === resolvedHref ){
					return cb();
				}
			}
			setTimeout(function() {
				onloadcssdefined( cb );
			});
		};

		// once loaded, set link's media back to `all` so that the stylesheet applies once it loads
		ss.onloadcssdefined = onloadcssdefined;
		onloadcssdefined(function() {
			ss.media = media || "all";
		});
		return ss;
	};
	// commonjs
	if( typeof module !== "undefined" ){
		module.exports = loadCSS;
	}
	else {
		w.loadCSS = loadCSS;
	}
}( typeof global !== "undefined" ? global : this ));


/*!
onloadCSS: adds onload support for asynchronous stylesheets loaded with loadCSS.
[c]2014 @zachleat, Filament Group, Inc.
Licensed MIT
*/

/* global navigator */
/* exported onloadCSS */
function onloadCSS( ss, callback ) {
	ss.onload = function() {
		ss.onload = null;
		if( callback ) {
			callback.call( ss );
		}
	};

	// This code is for browsers that don’t support onload, any browser that
	// supports onload should use that instead.
	// No support for onload:
	//	* Android 4.3 (Samsung Galaxy S4, Browserstack)
	//	* Android 4.2 Browser (Samsung Galaxy SIII Mini GT-I8200L)
	//	* Android 2.3 (Pantech Burst P9070)

	// Weak inference targets Android < 4.4
	if( "isApplicationInstalled" in navigator && "onloadcssdefined" in ss ) {
		ss.onloadcssdefined( callback );
	}
}
