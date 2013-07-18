dojo.require("dijit.layout.BorderContainer");
dojo.require("dijit.layout.ContentPane");
dojo.require("dojo.data.ItemFileReadStore");
dojo.require("dijit.form.FilteringSelect");
dojo.require("esri.map");
dojo.require("esri.layers.FeatureLayer");
dojo.require("esri.tasks.GenerateRendererTask");
dojo.require("esri.dijit.Legend");
dojo.require("esri.dijit.Popup");
dojo.require("esri.layers.agsdynamic");

//the application
var enviroCar = {};

var rendererDefault = null;
var rendererBig = null;
var previousLod = 11;

function init() {
	esri.config.defaults.io.proxyUrl = "/proxy";

	enviroCar.dataUrl = "http://ags.dev.52north.org:6080/arcgis/rest/services/enviroCar/enviroCarTracks/MapServer";

	enviroCar.map = new esri.Map("enviroCarMap", {
		center : [ 7.633, 51.9585 ],
		zoom : previousLod,
		basemap : "gray",
		slider : false,
		infoWindow : createPopup()
	});

	prepareFeatureQuery();
	createPopupTemplate();
	
	//the track layer
	trackImageLayer = new esri.layers.ArcGISDynamicMapServiceLayer(enviroCar.dataUrl, {
		id : "tracks",
		visible : false
	});
	trackImageLayer.setVisibleLayers([ 0 ]);
	enviroCar.map.addLayer(trackImageLayer);

	// hide the loading icon when the track layer finishes updating
	dojo.connect(trackImageLayer, "onUpdateEnd", function() {
		dojo.style(dojo.byId("loading"), "visibility", "hidden");
	});

	// update renderer when field name changes
	dojo.connect(dijit.byId("fieldNames"), "onChange", changePhenomenon);
	dojo.connect(enviroCar.map, "onExtentChange", selectRendererOnScale);
	dojo.connect(enviroCar.map, 'onClick', queryFeatureInfo);

	// get field info
	retrieveFields();
}

function createPopup() {
	return new esri.dijit.Popup({
		markerSymbol : new esri.symbol.SimpleMarkerSymbol("circle", 32, null,
				new dojo.Color([ 0, 0, 0, 0.25 ])),
		marginLeft : "20",
		marginTop : "20"
	}, dojo.create("div"));
}

function prepareFeatureQuery() {
	enviroCar.queryTask = new esri.tasks.QueryTask(enviroCar.dataUrl + "/0");
	enviroCar.query = new esri.tasks.Query();
	enviroCar.query.returnGeometry = true;
	enviroCar.query.outFields = [ "starttime", "sensor", "speed", "co2",
			"consumption", "maf" ];
}

function retrieveFields() {
	var trackFields = esri.request({
		url : enviroCar.dataUrl + "/0",
		content : {
			f : "json"
		},
		callbackParamName : "callback"
	});
	trackFields.then(function(resp) {
		var fieldNames, fieldStore;

		fieldNames = {
			identifier : "value",
			label : "name",
			items : []
		};
		//fields 2 to 6 define the attributes
		dojo.forEach(resp.fields.slice(2, 6), function(f) {
			fieldNames.items.push({
				"name" : f.name,
				"value" : f.name
			});
		});
		fieldStore = new dojo.data.ItemFileReadStore({
			data : fieldNames
		});
		dijit.byId("fieldNames").set("store", fieldStore);
		dijit.byId("fieldNames").set("value", "speed"); // set a value
	}, function(err) {
		console.log("failed to get field names: ", err);
	});
}

function createPopupTemplate() {
	enviroCar.popupTemplate = new esri.dijit.PopupTemplate({
		title : "{sensor}",
		fieldInfos : [ {
			fieldName : "starttime",
			visible : true,
			label : "Time",
			format : {
				dateFormat : 'shortDateShortTime24'
			}
		}, {
			fieldName : "speed",
			visible : true,
			label : "Speed"
		}, {
			fieldName : "co2",
			visible : true,
			label : "CO2 Emission"
		}, {
			fieldName : "consumption",
			visible : true,
			label : "Fuel Consumption"
		}, {
			fieldName : "maf",
			visible : true,
			label : "Calculated MAF"
		} ]
	});
}

function queryFeatureInfo(e) {
	// build an extent around the click point
	var pad = enviroCar.map.extent.getWidth() / enviroCar.map.width * 3;
	var queryGeom = new esri.geometry.Extent(e.mapPoint.x - pad, e.mapPoint.y
			- pad, e.mapPoint.x + pad, e.mapPoint.y + pad,
			enviroCar.map.spatialReference);
	enviroCar.query.geometry = queryGeom;

	var def = enviroCar.queryTask.execute(enviroCar.query);
	def.addCallback(function(result) {
		return dojo.map(result.features, function(f) {
			f.setInfoTemplate(enviroCar.popupTemplate);
			return f;
		});
	});

	enviroCar.map.infoWindow.setFeatures([ def ]);
	enviroCar.map.infoWindow.show(e.screenPoint, enviroCar.map
			.getInfoWindowAnchor(e.screenPoint));
}

function selectRendererOnScale(extent, delta, outLevelChange, outLod) {
	if (outLod.level > 14 && previousLod <= 14) {
		applyRenderer(true);
	} else if (outLod.level <= 14 && previousLod > 14) {
		applyRenderer(false);
	}

	previousLod = outLod.level;
}

function changePhenomenon() {
	dojo.style(dojo.byId("loading"), "visibility", "visible");
	createRenderer(dijit.byId("fieldNames").get("value") || "speed");
}

function createRenderer(phenomenonField) {
	var request, requestBig;
	if (phenomenonField == "maf") {
		request = esri.request({
			url : "data/rendererMAF.json",
			handleAs : "json"
		});
		requestBig = esri.request({
			url : "data/rendererBigMAF.json",
			handleAs : "json"
		});
	} else if (phenomenonField == "co2") {
		request = esri.request({
			url : "data/rendererCo2.json",
			handleAs : "json"
		});
		requestBig = esri.request({
			url : "data/rendererBigCo2.json",
			handleAs : "json"
		});
	} else if (phenomenonField == "consumption") {
		request = esri.request({
			url : "data/rendererConsumption.json",
			handleAs : "json"
		});
		requestBig = esri.request({
			url : "data/rendererBigConsumption.json",
			handleAs : "json"
		});
	} else {
		request = esri.request({
			url : "data/rendererSpeed.json",
			handleAs : "json"
		});
		requestBig = esri.request({
			url : "data/rendererBigSpeed.json",
			handleAs : "json"
		});
	}
	request.then(function(response) {
		rendererDefault = new esri.renderer.ClassBreaksRenderer(response);
		applyRenderer(previousLod > 14);
	});
	requestBig.then(function(response) {
		rendererBig = new esri.renderer.ClassBreaksRenderer(response);
		applyRenderer(previousLod > 14);
	});
}

function applyRenderer(useBig) {
	var renderer;
	if (useBig) {
		renderer = rendererBig;
	} else {
		renderer = rendererDefault;
	}
	var optionsArray = [];
	var drawingOptions = new esri.layers.LayerDrawingOptions();
	drawingOptions.renderer = renderer;
	optionsArray[0] = drawingOptions;
	enviroCar.map.getLayer("tracks").setLayerDrawingOptions(optionsArray);
	enviroCar.map.getLayer("tracks").show();
	if (!enviroCar.hasOwnProperty("legend")) {
		createLegend();
	}
}

function createLegend() {
	enviroCar.legend = new esri.dijit.Legend({
		map : enviroCar.map,
		layerInfos : [ {
			layer : enviroCar.map.getLayer("tracks"),
			title : "enviroCar Tracks"
		} ]
	}, dojo.byId("legendDiv"));
	enviroCar.legend.startup();
}

function errorHandler(err) {
	console.log("error: ", dojo.toJson(err));
}

dojo.ready(init);