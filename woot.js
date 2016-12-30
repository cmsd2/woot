/*
 * 
 * Collaborative editing without Operational transformation. (Oster et al, 2005)
 * Builds a sequence of characters, each with a globally unique id.
 * Consistency Model: PCI (precondition preservation, convergence, intention preservation).
 * Complexity for n operations:
 * Space: O(n)
 * Time: worst case O(n^3)
 */

define(function(require, exports, module) {

  var woot = exports,
      me = {};

  var Class = require('lib/common.class');

  const DELETE = woot.DELETE = 'delete';
  const INSERT = woot.INSERT = 'insert';
  
  woot.WChar = Class({
    init: function(id, v, val, id_p, id_n) {
      this.id = id;
      this.visible = v;
      this.value = val;
      this.id_p = id_p;
      this.id_n = id_n;
    }
  });

  woot.WChar.visible = function(c) {
    return c.visible;
  };

  woot.WChar.value = function(c) {
    return c.value;
  };

  woot.WChar.id = function(c) {
    return c.id;
  };

  // strict total order on id
  woot.WChar.lt_id = function(c1, c2) {
    return c1.id[0] < c2.id[0] || (c1.id[0] === c2.id[0] && c1.id[1] < c2.id[1]);
  };

  woot.Op = Class({
    init: function(optype, wchar) {
      this.optype = optype;
      this.wchar = wchar;
    }
  });

  woot.WString = Class({
    cbegin: null,
    cend: null,
    wchars: null,
    pool: [],

    init: function(site_id) {
      this.site_id = site_id;
      this.next_wchar_id = 0;
      this.cbegin = new woot.WChar([0,0], true, null, null, [0,1]);
      this.cend= new woot.WChar([0,1], true, null, [0,0], null);
      this.wchars = [this.cbegin, this.cend];
    },

    length: function() {
      return this.wchars.length;
    },

    at: function(pos) {
      return this.wchars[pos];
    },

    prevChar: function(c) {
      return this.find(c.id_p);
    },

    nextChar: function(c) {
      return this.find(c.id_n);
    },

    find: function(id) {
      return _.detect(this.wchars, function(c) { return _.isEqual(c.id, id); });
    },

    pos: function(wchar) {
      var index = -1;
      _.detect(this.wchars, function(v, i) {
        return _.isEqual(wchar.id, v.id) ? (index = i, true) : false;
      });
      return index;
    },

    // inserts element c in S at position p
    insert: function(c, p) {
      this.wchars.splice(p, 0, c);
    },

    // returns the part of the sequence S between the elements c and d, both not included
    subseq: function(c, d) {
      var s = [];
      var i;
      var inRange = false;
      for(i = 0; i < this.wchars.length; i = i + 1) {
        if(!inRange) {
          if(_.isEqual(c.id, this.wchars[i].id)) {
            inRange = true;
          }
        } else if(_.isEqual(d.id, this.wchars[i].id)) {
          return s;
        } else {
          s.push(this.wchars[i]);
        }
      }
      throw Error("subseq end char not in string");
    },

    // returns true if c can be found in S
    contains: function(c) {
      return this.pos(c) != -1;
    },

    value: function() {
      return _.map(_.select(this.wchars, woot.WChar.visible), woot.WChar.value);
    },

    ithVisible: function(i) {
      return _.select(this.wchars, woot.WChar.visible)[i];
    },

    integrateIns: function(c, cp, cn) {
      var _this = this;
      var substr = this.subseq(cp, cn);
      if(substr.length === 0) {
        this.insert(c, this.pos(cn));
      } else {
        var lte = function(a, b) { return _this.pos(a) <= _this.pos(b); };
        var linearisation = _.select(substr, function(sc) {
          return lte(_this.prevChar(sc), cp) && lte(cn, _this.nextChar(sc));
        });
        linearisation = [cp].concat(linearisation);
        linearisation.push(cn);
        var i = 1;
        while(i < (linearisation.length - 1) && woot.WChar.lt_id(linearisation[i], c)) {
          i = i + 1;
        }
        this.integrateIns(c, linearisation[i - 1], linearisation[i]);
      }
    },

    integrateDel: function(c) {
      c.visible = false;
    },

    generateIns: function(pos, value) {
      var id = this.generateWCharId();
      var cp = this.ithVisible(pos);
      var cn = this.ithVisible(pos + 1);
      var wchar = new woot.WChar(id, true, value, cp.id, cn.id);
      this.integrateIns(wchar, cp, cn);
      return wchar;
    },

    generateDel: function(pos) {
      var wchar = this.ithVisible(pos);
      this.integrateDel(wchar);
      return wchar;
    },

    generateWCharId: function() {
      var id = [this.site_id, this.next_wchar_id];
      this.next_wchar_id = this.next_wchar_id + 1;
      return id;
    },

    enqueueIns: function(wchar) {
      this.pool.push(new woot.Op(INSERT, wchar));
    },

    enqueueDel: function(wchar) {
      this.pool.push(new woot.Op(DELETE, wchar));
    },

    isExecutable: function(op) {
      var c = op.wchar;
      if(op.optype === DELETE) {
        return this.contains(c);
      } else if(op.optype === INSERT) {
        return this.prevChar(c) && this.nextChar(c);
      }
    },

    execute: function(op) {
      var wchar = op.wchar;
      if(op.optype === INSERT) {
        this.integrateIns(wchar, this.prevChar(wchar), this.nextChar(wchar));
      } else if(op.optype === DELETE) {
        this.integrateDel(wchar);
      }
    },

    doWork: function() {
      var _this = this;
      var madeProgress = false;
      var newpool = [];
      _.each(this.pool, function(op) {
        if(_this.isExecutable(op)) {
          _this.execute(op);
          madeProgress = true;
        } else {
          newpool.push(op);
        }
      });
      this.pool = newpool;
      return madeProgress;
    }

  });

});
