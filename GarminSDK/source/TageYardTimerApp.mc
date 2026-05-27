using Toybox.Application;
using Toybox.WatchUi;

class TageYardTimerApp extends Application.AppBase {

    private var _view;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
    }

    function onStop(state) {
    }

    function getInitialView() {
        _view = new TageYardTimerView();
        return [ _view ];
    }

    function onSettingsChanged() {
        if (_view != null) {
            _view.rebuildSchedule();
        }
        WatchUi.requestUpdate();
    }
}
