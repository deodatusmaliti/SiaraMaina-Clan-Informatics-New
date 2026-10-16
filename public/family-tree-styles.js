/**
 * SiaraMaina Clan Platform - 6 Distinct Classical Family Tree Styles
 * ------------------------------------------------------------------------
 * 1. classical-collapsible: Interactive Collapsible Classical Tree
 * 2. classical-rounded:     Rounded-Node Classical Tree (Pill Nodes with Curved Connectors)
 * 3. classical-square:      Square/Rectangular-Node Classical Tree (Crisp Cards & Orthogonal Elbows)
 * 4. classical-compact:     Compact Classical Tree (High-Density Multi-Generation Overview)
 * 5. classical-ltr:         Left-to-Right Classical Tree (Horizontal Ancestry Lineage Flow)
 * 6. classical-radial:      Radial Classical Tree (Concentric Radiating Generational Rings with Non-Intermingling Labels)
 */

(function(window) {
  'use strict';

  // Branch Color Palette Constants
  var BRANCH_COLORS = {
    heritage: { hex: 0xe9bf52, css: '#e9bf52', text: '#0a291d', label: 'Foundational Roots', bg: '#fefce8', border: '#fef08a' },
    siara:    { hex: 0x103d2b, css: '#103d2b', text: '#ffffff', label: 'Siara Branch', bg: '#f0fdf4', border: '#bbf7d0' },
    maina:    { hex: 0xb45309, css: '#b45309', text: '#ffffff', label: 'Maina Branch', bg: '#fffbeb', border: '#fde68a' },
    maliti:   { hex: 0x0d9488, css: '#0d9488', text: '#ffffff', label: 'Maliti Family', bg: '#f0fdfa', border: '#99f6e4' }
  };

  function getBranchColor(branchType) {
    var b = (branchType || '').toLowerCase();
    return BRANCH_COLORS[b] || BRANCH_COLORS.heritage;
  }
  window.getBranchColor = getBranchColor;

  // Cleanup helper to prepare canvas before rendering a new tree style
  function cleanupTreeCanvas() {
    if (window._tree3dAnimId) {
      cancelAnimationFrame(window._tree3dAnimId);
      window._tree3dAnimId = null;
    }
    if (window._tree3dRenderer && window._tree3dRenderer.dispose) {
      try { window._tree3dRenderer.dispose(); } catch (e) {}
      window._tree3dRenderer = null;
    }
    var canvas = document.getElementById("treeCanvas");
    if (canvas) canvas.innerHTML = "";
    window.d3TreeSvgInstance = null;
    window._treeD3Zoom = null;
    window._treeD3Svg = null;
  }
  window.cleanupCurrentTreeRenderer = cleanupTreeCanvas;

  // Safe helper to open profile
  function triggerMemberProfile(d) {
    var id = (d && d.data && d.data.id) ? d.data.id : (d && d.id ? d.id : null);
    var record = (d && d.data && d.data.record) ? d.data.record : (d && d.record ? d.record : null);
    if (!record && id && typeof window.findRecord === "function") {
      record = window.findRecord(id);
    }
    if (typeof window.openMemberDetailModal === "function" && id) {
      window.openMemberDetailModal(id);
    } else if (typeof window.openProfile === "function" && record) {
      window.openProfile(record);
    }
  }

  // Common Search & Spotlight bar for all classical trees
  function createTreeSearchPanel(wrapper, d3Root, onSelectMember, currentRootRecord) {
    var searchPanel = wrapper.append("div")
      .attr("class", "d3-tree-search-panel")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "10px")
      .style("padding", "8px 12px")
      .style("background", "rgba(255,255,255,0.94)")
      .style("backdrop-filter", "blur(8px)")
      .style("border-bottom", "1px solid var(--line)")
      .style("flex-wrap", "wrap");

    searchPanel.append("span").style("font-size", "1rem").text("🔍");

    searchPanel.append("input")
      .attr("type", "search")
      .attr("class", "d3-tree-search-input")
      .attr("placeholder", "Search member in tree...")
      .style("padding", "6px 12px")
      .style("border", "1px solid var(--line)")
      .style("border-radius", "6px")
      .style("font-size", "0.8rem")
      .style("min-width", "200px")
      .style("flex", "1")
      .on("input", function() {
        var val = this.value.trim().toLowerCase();
        if (!val) {
          d3.selectAll(".classical-node").classed("node-selected", false);
          return;
        }
        var matchNode = null;
        d3Root.each(function(d) {
          var name = (d.data.name || "").toLowerCase();
          var clanNum = (d.data.clanNumber || "").toLowerCase();
          if ((name.indexOf(val) !== -1 || clanNum.indexOf(val) !== -1) && !matchNode) {
            matchNode = d;
          }
        });
        if (matchNode && typeof onSelectMember === "function") {
          onSelectMember(matchNode);
        }
      });

    // Root switcher dropdown
    var rootSelect = searchPanel.append("select")
      .style("padding", "6px 10px")
      .style("border", "1px solid var(--line)")
      .style("border-radius", "6px")
      .style("font-size", "0.75rem")
      .style("font-weight", "800")
      .style("background", "#fff")
      .on("change", function() {
        if (typeof window.showTree === "function") {
          window.showTree("custom", this.value, window.currentFamilyTreeStyle);
        }
      });

    var roots = [
      { id: "ngowi1", label: "👑 Clan Root (Ngowi I)" },
      { id: "siara", label: "🌿 Siara Branch" },
      { id: "maina", label: "🍂 Maina Branch" },
      { id: "josephMaliti", label: "🏛️ Maliti Family" }
    ];

    roots.forEach(function(r) {
      rootSelect.append("option")
        .attr("value", r.id)
        .attr("selected", (currentRootRecord && currentRootRecord.id === r.id) ? true : null)
        .text(r.label);
    });

    return searchPanel;
  }

  // =========================================================================
  // 2. ROUNDED-NODE CLASSICAL TREE (Pill Nodes & Smooth Curved Connectors)
  // =========================================================================
  window.renderClassicalRoundedTree = function(rootRecord, filterBranch, targetHighlightId) {
    cleanupTreeCanvas();
    var container = document.getElementById("treeCanvas");
    if (!container) return;

    if (typeof d3 === "undefined") {
      container.innerHTML = '<div class="empty">Loading visualization library...</div>';
      return;
    }

    var hierarchyData = (typeof window.buildD3HierarchyData === "function")
      ? window.buildD3HierarchyData(rootRecord, filterBranch)
      : null;

    if (!hierarchyData) {
      container.innerHTML = '<div class="empty">No genealogical records found for the selected branch.</div>';
      return;
    }

    var wrapper = d3.select(container).append("div")
      .attr("class", "d3-tree-container")
      .attr("id", "d3TreeWrapper")
      .style("width", "100%")
      .style("height", "680px")
      .style("position", "relative")
      .style("overflow", "hidden")
      .style("background", "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)");

    var d3Root = d3.hierarchy(hierarchyData);
    var nodeWidth = 220;
    var nodeHeight = 64;

    var treeLayout = d3.tree().nodeSize([nodeWidth + 40, nodeHeight + 80]);
    treeLayout(d3Root);

    var svg = wrapper.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("cursor", "grab");

    var defs = svg.append("defs");

    var g = svg.append("g");
    var gLink = g.append("g").attr("class", "links-layer");
    var gNode = g.append("g").attr("class", "nodes-layer");

    var zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", function(event) {
        g.attr("transform", event.transform);
        var label = document.getElementById("treeZoomLabel");
        if (label) label.textContent = Math.round(event.transform.k * 100) + "%";
      });

    svg.call(zoom);
    window.d3TreeSvgInstance = { svg: svg, zoom: zoom, g: g };
    window._treeD3Zoom = zoom;
    window._treeD3Svg = svg;

    createTreeSearchPanel(wrapper, d3Root, function(matchNode) {
      d3.selectAll(".classical-node").classed("node-selected", false);
      var sel = d3.select("#node_rounded_" + matchNode.data.id);
      sel.classed("node-selected", true);
      var scale = 1.1;
      var w = container.clientWidth || 900;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(w/2 - matchNode.x * scale, 120 - matchNode.y * scale).scale(scale));
    }, rootRecord);

    // Smooth cubic bezier curved connectors
    gLink.selectAll("path")
      .data(d3Root.links())
      .enter()
      .append("path")
      .attr("d", d3.linkVertical()
        .x(function(d) { return d.x; })
        .y(function(d) { return d.y; })
      )
      .attr("fill", "none")
      .attr("stroke", function(d) {
        var bc = getBranchColor(d.target.data.branch);
        return bc.css;
      })
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.65);

    // Nodes (Pill shape with smooth rounded corners)
    var nodes = gNode.selectAll(".classical-node")
      .data(d3Root.descendants())
      .enter()
      .append("g")
      .attr("class", "classical-node")
      .attr("id", function(d) { return "node_rounded_" + d.data.id; })
      .attr("transform", function(d) { return "translate(" + (d.x - nodeWidth / 2) + "," + (d.y - nodeHeight / 2) + ")"; })
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        triggerMemberProfile(d);
      });

    // Pill background
    nodes.append("rect")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 32)
      .attr("ry", 32)
      .attr("fill", "#ffffff")
      .attr("stroke", function(d) { return getBranchColor(d.data.branch).css; })
      .attr("stroke-width", 2)
      .style("filter", "drop-shadow(0 4px 10px rgba(0,0,0,0.06))");

    // Avatar / Round Picture Placeholder
    nodes.each(function(d) {
      var nodeEl = d3.select(this);
      var rec = d.data.record || {};
      var photoUrl = rec.photo && String(rec.photo).trim();
      var branch = getBranchColor(d.data.branch);
      var avatarG = nodeEl.append("g").attr("transform", "translate(32, 32)");

      if (photoUrl) {
        var clipId = "clip_rnd_" + d.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", 22);

        avatarG.append("image")
          .attr("href", photoUrl)
          .attr("x", -22)
          .attr("y", -22)
          .attr("width", 44)
          .attr("height", 44)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#" + clipId + ")");

        avatarG.append("circle")
          .attr("r", 22)
          .attr("fill", "none")
          .attr("stroke", branch.css)
          .attr("stroke-width", 2);
      } else {
        avatarG.append("circle")
          .attr("r", 22)
          .attr("fill", branch.bg)
          .attr("stroke", branch.css)
          .attr("stroke-width", 1.8)
          .attr("stroke-dasharray", "3,2");

        var initialsText = "?";
        var n = d.data.name || "";
        var parts = n.split(" ").filter(Boolean);
        initialsText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (n[0] || "?").toUpperCase();

        avatarG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", branch.css)
          .style("font-size", "11px")
          .style("font-weight", "900")
          .text(initialsText);

        var badgeG = avatarG.append("g").attr("transform", "translate(14, 14)");
        badgeG.append("circle")
          .attr("r", 6)
          .attr("fill", "#ffffff")
          .attr("stroke", branch.css)
          .attr("stroke-width", 1);
        badgeG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .style("font-size", "6.5px")
          .text("📷");
      }
    });

    // Name text
    nodes.append("text")
      .attr("x", 64)
      .attr("y", 26)
      .attr("fill", "#0f172a")
      .style("font-size", "12px")
      .style("font-weight", "800")
      .text(function(d) {
        var n = d.data.name || "";
        return n.length > 18 ? n.slice(0, 16) + "…" : n;
      });

    // Subtitle (Generation, DOB / DOD / Current Age)
    nodes.append("text")
      .attr("x", 64)
      .attr("y", 44)
      .attr("fill", "#64748b")
      .style("font-size", "9.5px")
      .style("font-weight", "600")
      .text(function(d) {
        var rec = d.data.record || {};
        var gen = d.data.generation !== undefined ? "Gen " + d.data.generation : "";
        var dobStr = rec.dob || rec.birthPeriod || "";
        var dodStr = rec.dod || "";
        if (rec.deceased || dodStr) {
          var ageDeath = (typeof window.calculateAge === "function") ? window.calculateAge(rec, rec.dod) : null;
          return gen + " • Born: " + (dobStr || "Unknown") + " • Died: " + (dodStr || "Unknown") + (ageDeath !== null ? " (" + ageDeath + " yrs)" : "");
        }
        var ageLiving = (typeof window.calculateAge === "function") ? window.calculateAge(rec, "") : null;
        return gen + " • Born: " + (dobStr || "Unknown") + (ageLiving !== null ? " • Age " + ageLiving : "") + " • 🟢 Living";
      });

    // Initial Fit to Screen
    setTimeout(function() {
      if (typeof window.fitTreeToWidth === "function") window.fitTreeToWidth();
    }, 50);
  };

  // =========================================================================
  // 3. SQUARE/RECTANGULAR-NODE CLASSICAL TREE (Crisp Cards & Orthogonal Elbows)
  // =========================================================================
  window.renderClassicalSquareTree = function(rootRecord, filterBranch, targetHighlightId) {
    cleanupTreeCanvas();
    var container = document.getElementById("treeCanvas");
    if (!container) return;

    if (typeof d3 === "undefined") {
      container.innerHTML = '<div class="empty">Loading visualization library...</div>';
      return;
    }

    var hierarchyData = (typeof window.buildD3HierarchyData === "function")
      ? window.buildD3HierarchyData(rootRecord, filterBranch)
      : null;

    if (!hierarchyData) {
      container.innerHTML = '<div class="empty">No genealogical records found for the selected branch.</div>';
      return;
    }

    var wrapper = d3.select(container).append("div")
      .attr("class", "d3-tree-container")
      .attr("id", "d3TreeWrapper")
      .style("width", "100%")
      .style("height", "680px")
      .style("position", "relative")
      .style("overflow", "hidden")
      .style("background", "#fafaf9");

    var d3Root = d3.hierarchy(hierarchyData);
    var nodeWidth = 230;
    var nodeHeight = 84;

    var treeLayout = d3.tree().nodeSize([nodeWidth + 50, nodeHeight + 80]);
    treeLayout(d3Root);

    var svg = wrapper.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("cursor", "grab");

    var defs = svg.append("defs");

    var g = svg.append("g");
    var gLink = g.append("g").attr("class", "links-layer");
    var gNode = g.append("g").attr("class", "nodes-layer");

    var zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", function(event) {
        g.attr("transform", event.transform);
        var label = document.getElementById("treeZoomLabel");
        if (label) label.textContent = Math.round(event.transform.k * 100) + "%";
      });

    svg.call(zoom);
    window.d3TreeSvgInstance = { svg: svg, zoom: zoom, g: g };
    window._treeD3Zoom = zoom;
    window._treeD3Svg = svg;

    createTreeSearchPanel(wrapper, d3Root, function(matchNode) {
      d3.selectAll(".classical-node").classed("node-selected", false);
      var sel = d3.select("#node_square_" + matchNode.data.id);
      sel.classed("node-selected", true);
      var scale = 1.1;
      var w = container.clientWidth || 900;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(w/2 - matchNode.x * scale, 120 - matchNode.y * scale).scale(scale));
    }, rootRecord);

    // Orthogonal right-angle elbow connector step links
    gLink.selectAll("path")
      .data(d3Root.links())
      .enter()
      .append("path")
      .attr("d", function(d) {
        var sx = d.source.x;
        var sy = d.source.y + nodeHeight / 2;
        var tx = d.target.x;
        var ty = d.target.y - nodeHeight / 2;
        var midY = (sy + ty) / 2;
        return "M " + sx + " " + sy +
               " L " + sx + " " + midY +
               " L " + tx + " " + midY +
               " L " + tx + " " + ty;
      })
      .attr("fill", "none")
      .attr("stroke", "#475569")
      .attr("stroke-width", 1.8)
      .attr("stroke-opacity", 0.7);

    // Nodes (Sharp card with header strip & round picture placeholder)
    var nodes = gNode.selectAll(".classical-node")
      .data(d3Root.descendants())
      .enter()
      .append("g")
      .attr("class", "classical-node")
      .attr("id", function(d) { return "node_square_" + d.data.id; })
      .attr("transform", function(d) { return "translate(" + (d.x - nodeWidth / 2) + "," + (d.y - nodeHeight / 2) + ")"; })
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        triggerMemberProfile(d);
      });

    // Outer card border
    nodes.append("rect")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#ffffff")
      .attr("stroke", "#334155")
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.06))");

    // Header strip for branch identification
    nodes.append("rect")
      .attr("width", nodeWidth)
      .attr("height", 20)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", function(d) { return getBranchColor(d.data.branch).css; });

    // Header label
    nodes.append("text")
      .attr("x", 8)
      .attr("y", 14)
      .attr("fill", "#ffffff")
      .style("font-size", "10px")
      .style("font-weight", "800")
      .text(function(d) {
        var b = getBranchColor(d.data.branch).label;
        var gen = d.data.generation !== undefined ? " • Gen " + d.data.generation : "";
        return b + gen;
      });

    // Round Member Picture / Placeholder inside square card
    nodes.each(function(d) {
      var nodeEl = d3.select(this);
      var rec = d.data.record || {};
      var photoUrl = rec.photo && String(rec.photo).trim();
      var branch = getBranchColor(d.data.branch);
      var avatarG = nodeEl.append("g").attr("transform", "translate(30, 52)");

      if (photoUrl) {
        var clipId = "clip_sq_" + d.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", 20);

        avatarG.append("image")
          .attr("href", photoUrl)
          .attr("x", -20)
          .attr("y", -20)
          .attr("width", 40)
          .attr("height", 40)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#" + clipId + ")");

        avatarG.append("circle")
          .attr("r", 20)
          .attr("fill", "none")
          .attr("stroke", branch.css)
          .attr("stroke-width", 2);
      } else {
        avatarG.append("circle")
          .attr("r", 20)
          .attr("fill", branch.bg)
          .attr("stroke", branch.css)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "3,2");

        var n = d.data.name || "";
        var parts = n.split(" ").filter(Boolean);
        var initialsText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (n[0] || "?").toUpperCase();

        avatarG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", branch.css)
          .style("font-size", "10px")
          .style("font-weight", "900")
          .text(initialsText);

        var badgeG = avatarG.append("g").attr("transform", "translate(13, 13)");
        badgeG.append("circle")
          .attr("r", 5.5)
          .attr("fill", "#ffffff")
          .attr("stroke", branch.css)
          .attr("stroke-width", 1);
        badgeG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .style("font-size", "6px")
          .text("📷");
      }
    });

    // Member Name
    nodes.append("text")
      .attr("x", 58)
      .attr("y", 46)
      .attr("fill", "#0f172a")
      .style("font-size", "12px")
      .style("font-weight", "800")
      .text(function(d) {
        var n = d.data.name || "";
        return n.length > 18 ? n.slice(0, 16) + "…" : n;
      });

    // Clan ID / Dates
    nodes.append("text")
      .attr("x", 58)
      .attr("y", 64)
      .attr("fill", "#64748b")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .text(function(d) {
        return d.data.clanNumber ? "ID: " + d.data.clanNumber : "Member";
      });

    setTimeout(function() {
      if (typeof window.fitTreeToWidth === "function") window.fitTreeToWidth();
    }, 50);
  };

  // =========================================================================
  // 4. COMPACT CLASSICAL TREE (High-Density Multi-Generation Overview)
  // =========================================================================
  window.renderClassicalCompactTree = function(rootRecord, filterBranch, targetHighlightId) {
    cleanupTreeCanvas();
    var container = document.getElementById("treeCanvas");
    if (!container) return;

    if (typeof d3 === "undefined") {
      container.innerHTML = '<div class="empty">Loading visualization library...</div>';
      return;
    }

    var hierarchyData = (typeof window.buildD3HierarchyData === "function")
      ? window.buildD3HierarchyData(rootRecord, filterBranch)
      : null;

    if (!hierarchyData) {
      container.innerHTML = '<div class="empty">No genealogical records found for the selected branch.</div>';
      return;
    }

    var wrapper = d3.select(container).append("div")
      .attr("class", "d3-tree-container")
      .attr("id", "d3TreeWrapper")
      .style("width", "100%")
      .style("height", "680px")
      .style("position", "relative")
      .style("overflow", "hidden")
      .style("background", "#ffffff");

    var d3Root = d3.hierarchy(hierarchyData);
    var nodeWidth = 175;
    var nodeHeight = 50;

    var treeLayout = d3.tree().nodeSize([nodeWidth + 24, nodeHeight + 48]);
    treeLayout(d3Root);

    var svg = wrapper.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("cursor", "grab");

    var defs = svg.append("defs");

    var g = svg.append("g");
    var gLink = g.append("g").attr("class", "links-layer");
    var gNode = g.append("g").attr("class", "nodes-layer");

    var zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", function(event) {
        g.attr("transform", event.transform);
        var label = document.getElementById("treeZoomLabel");
        if (label) label.textContent = Math.round(event.transform.k * 100) + "%";
      });

    svg.call(zoom);
    window.d3TreeSvgInstance = { svg: svg, zoom: zoom, g: g };
    window._treeD3Zoom = zoom;
    window._treeD3Svg = svg;

    createTreeSearchPanel(wrapper, d3Root, function(matchNode) {
      d3.selectAll(".classical-node").classed("node-selected", false);
      var sel = d3.select("#node_compact_" + matchNode.data.id);
      sel.classed("node-selected", true);
      var scale = 1.2;
      var w = container.clientWidth || 900;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(w/2 - matchNode.x * scale, 120 - matchNode.y * scale).scale(scale));
    }, rootRecord);

    // Crisp connector lines
    gLink.selectAll("path")
      .data(d3Root.links())
      .enter()
      .append("path")
      .attr("d", d3.linkVertical()
        .x(function(d) { return d.x; })
        .y(function(d) { return d.y; })
      )
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5);

    // Nodes (Condensed cards)
    var nodes = gNode.selectAll(".classical-node")
      .data(d3Root.descendants())
      .enter()
      .append("g")
      .attr("class", "classical-node")
      .attr("id", function(d) { return "node_compact_" + d.data.id; })
      .attr("transform", function(d) { return "translate(" + (d.x - nodeWidth / 2) + "," + (d.y - nodeHeight / 2) + ")"; })
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        triggerMemberProfile(d);
      });

    // Card background
    nodes.append("rect")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#ffffff")
      .attr("stroke", function(d) { return getBranchColor(d.data.branch).border; })
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.05))");

    // Round Picture / Placeholder in compact view
    nodes.each(function(d) {
      var nodeEl = d3.select(this);
      var rec = d.data.record || {};
      var photoUrl = rec.photo && String(rec.photo).trim();
      var branch = getBranchColor(d.data.branch);
      var avatarG = nodeEl.append("g").attr("transform", "translate(22, 25)");

      if (photoUrl) {
        var clipId = "clip_cmp_" + d.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", 15);

        avatarG.append("image")
          .attr("href", photoUrl)
          .attr("x", -15)
          .attr("y", -15)
          .attr("width", 30)
          .attr("height", 30)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#" + clipId + ")");

        avatarG.append("circle")
          .attr("r", 15)
          .attr("fill", "none")
          .attr("stroke", branch.css)
          .attr("stroke-width", 1.5);
      } else {
        avatarG.append("circle")
          .attr("r", 15)
          .attr("fill", branch.bg)
          .attr("stroke", branch.css)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "2,2");

        var n = d.data.name || "";
        var parts = n.split(" ").filter(Boolean);
        var initialsText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (n[0] || "?").toUpperCase();

        avatarG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", branch.css)
          .style("font-size", "9px")
          .style("font-weight", "900")
          .text(initialsText);
      }
    });

    // Name text
    nodes.append("text")
      .attr("x", 44)
      .attr("y", 22)
      .attr("fill", "#1e293b")
      .style("font-size", "11px")
      .style("font-weight", "800")
      .text(function(d) {
        var n = d.data.name || "";
        return n.length > 17 ? n.slice(0, 15) + "…" : n;
      });

    // Subtitle
    nodes.append("text")
      .attr("x", 44)
      .attr("y", 37)
      .attr("fill", "#64748b")
      .style("font-size", "9px")
      .style("font-weight", "600")
      .text(function(d) {
        var gen = d.data.generation !== undefined ? "G" + d.data.generation : "";
        var id = d.data.clanNumber ? " • " + d.data.clanNumber : "";
        return gen + id;
      });

    setTimeout(function() {
      if (typeof window.fitTreeToWidth === "function") window.fitTreeToWidth();
    }, 50);
  };

  // =========================================================================
  // 5. LEFT-TO-RIGHT CLASSICAL TREE (Horizontal Ancestry Lineage Flow)
  // =========================================================================
  window.renderClassicalLtrTree = function(rootRecord, filterBranch, targetHighlightId) {
    cleanupTreeCanvas();
    var container = document.getElementById("treeCanvas");
    if (!container) return;

    if (typeof d3 === "undefined") {
      container.innerHTML = '<div class="empty">Loading visualization library...</div>';
      return;
    }

    var hierarchyData = (typeof window.buildD3HierarchyData === "function")
      ? window.buildD3HierarchyData(rootRecord, filterBranch)
      : null;

    if (!hierarchyData) {
      container.innerHTML = '<div class="empty">No genealogical records found for the selected branch.</div>';
      return;
    }

    var wrapper = d3.select(container).append("div")
      .attr("class", "d3-tree-container")
      .attr("id", "d3TreeWrapper")
      .style("width", "100%")
      .style("height", "680px")
      .style("position", "relative")
      .style("overflow", "hidden")
      .style("background", "linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)");

    var d3Root = d3.hierarchy(hierarchyData);
    var nodeWidth = 230;
    var nodeHeight = 64;

    var treeLayout = d3.tree().nodeSize([nodeHeight + 36, nodeWidth + 90]);
    treeLayout(d3Root);

    var svg = wrapper.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("cursor", "grab");

    var defs = svg.append("defs");

    var g = svg.append("g");
    var gLink = g.append("g").attr("class", "links-layer");
    var gNode = g.append("g").attr("class", "nodes-layer");

    var zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", function(event) {
        g.attr("transform", event.transform);
        var label = document.getElementById("treeZoomLabel");
        if (label) label.textContent = Math.round(event.transform.k * 100) + "%";
      });

    svg.call(zoom);
    window.d3TreeSvgInstance = { svg: svg, zoom: zoom, g: g };
    window._treeD3Zoom = zoom;
    window._treeD3Svg = svg;

    createTreeSearchPanel(wrapper, d3Root, function(matchNode) {
      d3.selectAll(".classical-node").classed("node-selected", false);
      var sel = d3.select("#node_ltr_" + matchNode.data.id);
      sel.classed("node-selected", true);
      var scale = 1.1;
      var h = 680;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(140 - matchNode.y * scale, h/2 - matchNode.x * scale).scale(scale));
    }, rootRecord);

    // Horizontal cubic bezier curves connecting parent right edge to child left edge
    gLink.selectAll("path")
      .data(d3Root.links())
      .enter()
      .append("path")
      .attr("d", d3.linkHorizontal()
        .x(function(d) { return d.y; })
        .y(function(d) { return d.x; })
      )
      .attr("fill", "none")
      .attr("stroke", function(d) { return getBranchColor(d.target.data.branch).css; })
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.65);

    // Nodes (Cards positioned at y, x)
    var nodes = gNode.selectAll(".classical-node")
      .data(d3Root.descendants())
      .enter()
      .append("g")
      .attr("class", "classical-node")
      .attr("id", function(d) { return "node_ltr_" + d.data.id; })
      .attr("transform", function(d) { return "translate(" + (d.y - nodeWidth / 2) + "," + (d.x - nodeHeight / 2) + ")"; })
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        triggerMemberProfile(d);
      });

    // Card background
    nodes.append("rect")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 10)
      .attr("ry", 10)
      .attr("fill", "#ffffff")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.06))");

    // Left accent stripe
    nodes.append("rect")
      .attr("width", 6)
      .attr("height", nodeHeight)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", function(d) { return getBranchColor(d.data.branch).css; });

    // Round Member Picture / Placeholder
    nodes.each(function(d) {
      var nodeEl = d3.select(this);
      var rec = d.data.record || {};
      var photoUrl = rec.photo && String(rec.photo).trim();
      var branch = getBranchColor(d.data.branch);
      var avatarG = nodeEl.append("g").attr("transform", "translate(32, 32)");

      if (photoUrl) {
        var clipId = "clip_ltr_" + d.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", 20);

        avatarG.append("image")
          .attr("href", photoUrl)
          .attr("x", -20)
          .attr("y", -20)
          .attr("width", 40)
          .attr("height", 40)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#" + clipId + ")");

        avatarG.append("circle")
          .attr("r", 20)
          .attr("fill", "none")
          .attr("stroke", branch.css)
          .attr("stroke-width", 2);
      } else {
        avatarG.append("circle")
          .attr("r", 20)
          .attr("fill", branch.bg)
          .attr("stroke", branch.css)
          .attr("stroke-width", 1.8)
          .attr("stroke-dasharray", "3,2");

        var n = d.data.name || "";
        var parts = n.split(" ").filter(Boolean);
        var initialsText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (n[0] || "?").toUpperCase();

        avatarG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", branch.css)
          .style("font-size", "10px")
          .style("font-weight", "900")
          .text(initialsText);

        var badgeG = avatarG.append("g").attr("transform", "translate(13, 13)");
        badgeG.append("circle")
          .attr("r", 5.5)
          .attr("fill", "#ffffff")
          .attr("stroke", branch.css)
          .attr("stroke-width", 1);
        badgeG.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .style("font-size", "6px")
          .text("📷");
      }
    });

    // Name text
    nodes.append("text")
      .attr("x", 60)
      .attr("y", 26)
      .attr("fill", "#0f172a")
      .style("font-size", "12px")
      .style("font-weight", "800")
      .text(function(d) {
        var n = d.data.name || "";
        return n.length > 18 ? n.slice(0, 16) + "…" : n;
      });

    // Generation and Clan ID
    nodes.append("text")
      .attr("x", 60)
      .attr("y", 46)
      .attr("fill", "#64748b")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .text(function(d) {
        var gen = d.data.generation !== undefined ? "Gen " + d.data.generation : "";
        var id = d.data.clanNumber ? " • " + d.data.clanNumber : "";
        return gen + id;
      });

    setTimeout(function() {
      if (typeof window.fitTreeToWidth === "function") window.fitTreeToWidth();
    }, 50);
  };

  // =========================================================================
  // 6. RADIAL CLASSICAL TREE (Concentric Radiating Generational Rings with Non-Intermingling Spread)
  // =========================================================================
  window.renderClassicalRadialTree = function(rootRecord, filterBranch, targetHighlightId) {
    cleanupTreeCanvas();
    var container = document.getElementById("treeCanvas");
    if (!container) return;

    if (typeof d3 === "undefined") {
      container.innerHTML = '<div class="empty">Loading visualization library...</div>';
      return;
    }

    var hierarchyData = (typeof window.buildD3HierarchyData === "function")
      ? window.buildD3HierarchyData(rootRecord, filterBranch)
      : null;

    if (!hierarchyData) {
      container.innerHTML = '<div class="empty">No genealogical records found for the selected branch.</div>';
      return;
    }

    var d3Root = d3.hierarchy(hierarchyData);

    // Calculate maximum generational depth
    var maxDepth = 1;
    d3Root.each(function(d) { if (d.depth > maxDepth) maxDepth = d.depth; });

    // Radial Step per level: Generous 160px - 220px per level so nodes and names spread naturally
    var radialStep = Math.max(160, Math.min(230, 950 / Math.max(1, maxDepth)));
    var totalRadius = radialStep * maxDepth;

    // Angle separation algorithm ensuring siblings & non-siblings have ample radial gap without name collision
    var treeLayout = d3.tree()
      .size([2 * Math.PI, totalRadius])
      .separation(function(a, b) {
        var baseSep = (a.parent === b.parent ? 2.5 : 5.0);
        return baseSep / Math.max(1, Math.sqrt(a.depth));
      });

    treeLayout(d3Root);

    var wrapper = d3.select(container).append("div")
      .attr("class", "d3-tree-container")
      .attr("id", "d3TreeWrapper")
      .style("width", "100%")
      .style("height", "720px")
      .style("position", "relative")
      .style("overflow", "hidden")
      .style("background", "radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%)");

    var width = container.clientWidth || 1000;
    var height = 720;

    var svg = wrapper.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("cursor", "grab");

    var defs = svg.append("defs");

    var g = svg.append("g")
      .attr("transform", "translate(" + (width / 2) + "," + (height / 2) + ")");

    var zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", function(event) {
        g.attr("transform", event.transform);
        var label = document.getElementById("treeZoomLabel");
        if (label) label.textContent = Math.round(event.transform.k * 100) + "%";
      });

    svg.call(zoom);

    // Center and scale to show full radial spread comfortably
    var initialScale = Math.min(0.85, (Math.min(width, height) - 60) / (totalRadius * 2));
    if (isNaN(initialScale) || initialScale <= 0) initialScale = 0.55;
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale));

    window.d3TreeSvgInstance = { svg: svg, zoom: zoom, g: g };
    window._treeD3Zoom = zoom;
    window._treeD3Svg = svg;

    createTreeSearchPanel(wrapper, d3Root, function(matchNode) {
      d3.selectAll(".classical-node").classed("node-selected", false);
      var sel = d3.select("#node_radial_" + matchNode.data.id);
      sel.classed("node-selected", true);
      var scale = 1.2;
      var point = d3.pointRadial(matchNode.x, matchNode.y);
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(width/2 - point[0] * scale, height/2 - point[1] * scale).scale(scale));
    }, rootRecord);

    // Generational guide rings with labels
    var guideGroup = g.append("g").attr("class", "radial-guide-rings");
    for (var r = 1; r <= maxDepth; r++) {
      var ringRadius = radialStep * r;
      guideGroup.append("circle")
        .attr("r", ringRadius)
        .attr("fill", "none")
        .attr("stroke", "#cbd5e1")
        .attr("stroke-dasharray", "4,4")
        .attr("stroke-width", 1.2);

      guideGroup.append("text")
        .attr("y", -ringRadius + 14)
        .attr("x", 0)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .style("font-size", "10px")
        .style("font-weight", "800")
        .text("Gen " + r);
    }

    // Radial Links
    g.append("g")
      .attr("class", "links-layer")
      .selectAll("path")
      .data(d3Root.links())
      .enter()
      .append("path")
      .attr("d", d3.linkRadial()
        .angle(function(d) { return d.x; })
        .radius(function(d) { return d.y; })
      )
      .attr("fill", "none")
      .attr("stroke", function(d) { return getBranchColor(d.target.data.branch).css; })
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6);

    // Nodes
    var nodes = g.append("g")
      .attr("class", "nodes-layer")
      .selectAll(".classical-node")
      .data(d3Root.descendants())
      .enter()
      .append("g")
      .attr("class", "classical-node")
      .attr("id", function(d) { return "node_radial_" + d.data.id; })
      .attr("transform", function(d) {
        return "rotate(" + (d.x * 180 / Math.PI - 90) + ")translate(" + d.y + ",0)";
      })
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        triggerMemberProfile(d);
      });

    // Round Member Picture / Empty Round Placeholder in Radial Tree
    nodes.each(function(d) {
      var nodeEl = d3.select(this);
      var rec = d.data.record || {};
      var photoUrl = rec.photo && String(rec.photo).trim();
      var branch = getBranchColor(d.data.branch);
      var radiusPx = d.depth === 0 ? 22 : 16;

      if (photoUrl) {
        // Member HAS picture -> Insert picture in round frame
        var clipId = "clip_rad_" + d.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", radiusPx);

        nodeEl.append("image")
          .attr("href", photoUrl)
          .attr("x", -radiusPx)
          .attr("y", -radiusPx)
          .attr("width", radiusPx * 2)
          .attr("height", radiusPx * 2)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#" + clipId + ")");

        nodeEl.append("circle")
          .attr("r", radiusPx)
          .attr("fill", "none")
          .attr("stroke", branch.css)
          .attr("stroke-width", 2.5);
      } else {
        // Member HAS NO picture -> Leave empty round placeholder ready to add photo later
        nodeEl.append("circle")
          .attr("r", radiusPx)
          .attr("fill", "#ffffff")
          .attr("stroke", branch.css)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "3,2");

        if (d.depth === 0) {
          nodeEl.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "14px")
            .text("👑");
        } else {
          var initialsText = "?";
          if (rec.firstName || d.data.name) {
            var parts = (rec.firstName ? (rec.firstName + " " + (rec.lastName || "")) : d.data.name).trim().split(" ");
            initialsText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0][0] || "?").toUpperCase();
          }
          nodeEl.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "10px")
            .style("font-weight", "900")
            .attr("fill", branch.css)
            .text(initialsText);

          // Camera icon badge indicating photo placeholder
          var badgeG = nodeEl.append("g").attr("transform", "translate(" + (radiusPx * 0.65) + "," + (radiusPx * 0.65) + ")");
          badgeG.append("circle")
            .attr("r", 5.5)
            .attr("fill", "#ffffff")
            .attr("stroke", branch.css)
            .attr("stroke-width", 1);
          badgeG.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "6px")
            .text("📷");
        }
      }
    });

    // Member text label radiating outward with anti-collision stroke halo & flip on left hemisphere
    nodes.append("text")
      .attr("dy", "0.35em")
      .attr("x", function(d) {
        var rPx = d.depth === 0 ? 22 : 16;
        return d.x < Math.PI ? (rPx + 8) : -(rPx + 8);
      })
      .attr("text-anchor", function(d) { return d.x < Math.PI ? "start" : "end"; })
      .attr("transform", function(d) { return d.x >= Math.PI ? "rotate(180)" : null; })
      .attr("fill", "#0f172a")
      .style("font-size", function(d) { return d.depth === 0 ? "13px" : "11px"; })
      .style("font-weight", "800")
      .style("paint-order", "stroke fill")
      .style("stroke", "#ffffff")
      .style("stroke-width", "4px")
      .style("stroke-linejoin", "round")
      .text(function(d) {
        var n = d.data.name || "";
        return n.length > 22 ? n.substring(0, 20) + "…" : n;
      });
  };

})(window);
