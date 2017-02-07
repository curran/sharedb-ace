class sharedbAceBinding {
  constructor(aceInstance, path, doc) {
    this.editor = aceInstance; 
    this.session = aceInstance.getSession(); 
    this.path = path;
    this.doc = doc;
    this.suppress = false; 
    this.setup(); 
  }

  setup() {
    const self = this;
    // Set initial data
    self.suppress = true;
    self.session.setValue(self.doc.data[self.path[0]]);
    self.suppress = false;

    self.session.removeAllListeners('change');
    self.doc.removeAllListeners('op');
    // self.session.on('change', self.onLocalChange.call(self));
      
    self.session.on('change', self.onLocalChange.bind(self));
    
    self.doc.on('op', self.onRemoteChange.bind(self)); 
  }
  
  /**
   * @param delta - delta that ace editor produces upon changes
   * eg. {'start':{'row':5,'column':1},'end':{'row':5,'column':2},'action':'insert','lines':['d']}
   */
  deltaTransform(delta) {
    // TODO: add path 
    const aceDoc = this.session.getDocument(); 
    const op = {};
    op.p = this.path.concat(aceDoc.positionToIndex(delta.start));
    let action;
    if (delta.action === 'insert') {
      action = 'si';
    } else if (delta.action === 'remove') {
      action = 'sd';
    } else {
      throw `action ${action} not supported`;
    }
    
    const str = delta.lines.join('\n');
    op[action] = str;
    return op;
  }

  /**
   * @param op - op that sharedb returns
   * eg. [{'p':[4],'sd':'e'}]
   */
  opTransform(op) {
    const self = this;
    const index = op.p[op.p.length -1]; 
    const pos = self.session.doc.indexToPosition(index, 0); 
    let action, lines;
    
    if('sd' in op) {
      action = 'remove';
      lines = op.sd.split('\n'); 
    } else if ('si' in op) {
      action = 'insert';
      lines = op.si.split('\n'); 
    } else {
      throw Exception('Invalid Operation: ' + JSON.stringify(op));
    }

    let count = 0;
    const newline = self.session.getDocument().getNewLineCharacter();
    for (let line in lines) {
      count += lines[line].length + newline.length;
    } 
    const start = pos;
    const end = self.session.doc.indexToPosition(index + count, 0);
    
    const delta = {
      'start': start,
      'end': end,
      'action': action,
      'lines': lines
    };
    return delta;
  }

  onLocalChange(delta) {
    console.log("local change event fired");
    console.log(delta);
    const self = this; 

    // Rerender the whole document
    self.repaint();

    // self.editor._signal("change", delta);
    
    // Update cursor because tab characters can influence the cursor position.
    self.editor.$cursorChange();
    self.editor.$updateHighlightActiveLine(); 

    if (self.suppress) return;
    
    const op = self.deltaTransform(delta);

    self.doc.submitOp(op, {source: self}, function(err) {
      if (err) throw err; 
    });
  }

  // Repaint the whole document
  // TODO: optimize, only repaint from start row onwards
  repaint() {
    var wrap = this.editor.session.$useWrapMode;
    var lastRow = this.session.getDocument().getLength() -1; 
    this.editor.renderer.updateLines(0, lastRow, wrap);
  }

  onRemoteChange(ops, source) {
    console.log("remove event fired");
    const self = this;
    if (source === self) return;
    const deltas = [];
    
    for (const op of ops) {
      deltas.push(self.opTransform(op));
    }
    
    self.suppress = true;
    self.session.getDocument().applyDeltas(deltas); 
    self.suppress = false;
    self.repaint();
  }
}

export default sharedbAceBinding;