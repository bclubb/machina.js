var Fsm = function(options) {
    var opt, initialState, defaults = utils.getDefaultOptions();
	if(options) {
		if(options.eventListeners) {
			options.eventListeners = parseEventListeners(options.eventListeners);
		}
		if(options.messaging) {
			options.messaging = _.extend({}, defaults.messaging, options.messaging);
		}
	}
	opt = _.extend(defaults , options || {});
	initialState = opt.initialState;
	delete opt.initialState;
	_.extend(this,opt);

	if(this.messaging.provider && messageBusProvider[this.messaging.provider]) {
		messageBusProvider[this.messaging.provider].wireUp(this);
	}

	this.state = undefined;
	this._priorAction = "";
	this._currentAction = "";
	if(initialState) {
		this.transition(initialState);
	}
	machina.eventListeners.fireEvent("newFsm", this);
};

Fsm.prototype.fireEvent = function(eventName) {
    var i = 0, len, args = arguments;
	_.each(this.eventListeners["*"], function(callback) {
		callback.apply(this,slice.call(args, 0));
	});
    if(this.eventListeners[eventName]) {
        _.each(this.eventListeners[eventName], function(callback) {
	        callback.apply(this,slice.call(args, 1));
        });
    }
};

Fsm.prototype.handle = function(msgType) {
	// vars to avoid a "this." fest
	var states = this.states, current = this.state, args = slice.call(arguments,0), handlerName;
	this.currentActionArgs = args;
    if(states[current] && (states[current][msgType] || states[current]["*"])) {
        handlerName = states[current][msgType] ? msgType : "*";
	    this._currentAction = current + "." + handlerName;
        this.fireEvent.apply(this, ["Handling"].concat(args));
	    states[current][handlerName].apply(this, args.slice(1));
        this.fireEvent.apply(this, ["Handled"].concat(args));
	    this._priorAction = this._currentAction;
	    this._currentAction = "";
	    this.processQueue(NEXT_HANDLER);
    }
    else {
        this.fireEvent.apply(this, ["NoHandler"].concat(args));
    }
	this.currentActionArgs = undefined;
};

Fsm.prototype.transition = function(newState) {
    if(this.states[newState]){
        var oldState = this.state;
        this.state = newState;
	    if(this.states[newState]._onEnter) {
		    this.states[newState]._onEnter.call( this );
	    }
        this.fireEvent.apply(this, ["Transitioned", oldState, this.state ]);
	    this.processQueue(NEXT_TRANSITION);
        return;
    }
    this.fireEvent.apply(this, ["InvalidState", this.state, newState ]);
};

Fsm.prototype.processQueue = function(type) {
	var filterFn = type === NEXT_TRANSITION ?
			function(item){
				return item.type === NEXT_TRANSITION && ((!item.untilState) || (item.untilState === this.state));
			} :
			function(item) {
				return item.type === NEXT_HANDLER;
			},
		toProcess = _.filter(this.eventQueue, filterFn, this);
	this.eventQueue = _.difference(this.eventQueue, toProcess);
	_.each(toProcess, function(item, index){
		this.handle.apply(this, item.args);
	}, this);
};

Fsm.prototype.deferUntilTransition = function(stateName) {
	if(this.currentActionArgs) {
		var queued = { type: NEXT_TRANSITION, untilState: stateName, args: this.currentActionArgs };
		this.eventQueue.push(queued);
		this.fireEvent.apply(this, [ "Deferred", this.state, queued ]);
	}
};

Fsm.prototype.deferUntilNextHandler = function() {
	if(this.currentActionArgs) {
		var queued = { type: NEXT_TRANSITION, args: this.currentActionArgs };
		this.eventQueue.push(queued);
		this.fireEvent.apply(this, [ "Deferred", this.state, queued ]);
	}
};

Fsm.prototype.on = function(eventName, callback) {
    if(!this.eventListeners[eventName]) {
	    this.eventListeners[eventName] = [];
    }
	this.eventListeners[eventName].push(callback);
};

Fsm.prototype.off = function(eventName, callback) {
    if(this.eventListeners[eventName]){
        _.without(this.eventListeners[eventName], callback);
    }
};
