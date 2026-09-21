// SPDX-License-Identifier: MIT
// Area text owns wrapping/alignment. Invisible private-use characters reserve
// the advance of linked formulas; a temporary outline locates their baselines.
// Original prose and formula objects are never outlined.
if (!$.global.l2aFlowCache) $.global.l2aFlowCache = {};
function l2aFlowSignature(tf) {
    var out = [tf.contents, tf.textPath.width, tf.textPath.height, tf.left, tf.top], i, a;
    for (i = 0; i < tf.characters.length; i++) {
        a = tf.characters[i].characterAttributes;
        out.push(a.size, a.textFont.name, a.horizontalScale, a.verticalScale, a.tracking, a.baselineShift, a.leading, a.fillColor.typename);
    }
    for (i = 0; i < tf.paragraphs.length; i++) {
        a = tf.paragraphs[i].paragraphAttributes;
        out.push(a.justification, a.leftIndent, a.rightIndent, a.firstLineIndent, a.spaceBefore, a.spaceAfter);
    }
    // Illustrator rounds character attributes when serializing an AI file.
    // Ignore sub-millipoint drift instead of rewriting unchanged reopened art.
    for(i=0;i<out.length;i++)if(typeof out[i]==='number')out[i]=Math.round(out[i]*1000)/1000;
    return out.join('|');
}
function l2aFlowLayout(tf, force) {
    var meta = new XML(tf.note), group = tf.parent, doc = app.activeDocument;
    var key = tf.uuid, signature = l2aFlowSignature(tf), cache = $.global.l2aFlowCache[key];
    if(!force) {
        try {
            if(tf.tags.getByName('LaTeX2AIFlowSignature').value===signature){
                $.global.l2aFlowCache[key]={done:signature};return false;
            }
        }catch(missingSignature){}
    }
    if (!force && cache && cache.done === signature) return false;
    if (!force && (!cache || cache.pending !== signature)) {
        $.global.l2aFlowCache[key] = {pending:signature, done:cache ? cache.done : ''}; return false;
    }
    var measure = null, outline = null, duplicate = null, i, j;
    try {
        var definitions = meta.formula, slots = {}, found = {}, metrics = {};
        var markerFont = app.textFonts.getByName('TimesNewRomanPSMT');
        var border = 72 / 72.27, noColor = new NoColor();
        var black = new GrayColor(); black.gray = 100;
        measure = doc.textFrames.pointText([0, 0]);
        measure.textRange.characterAttributes.textFont = markerFont;
        measure.textRange.characterAttributes.size = 100;
        measure.textRange.characterAttributes.fillColor = black;
        function reference(glyph, fontName) {
            var id = fontName + glyph;
            if (metrics[id]) return metrics[id];
            measure.textRange.characterAttributes.textFont = app.textFonts.getByName(fontName);
            measure.contents = '|' + glyph + '|'; var w = measure.width;
            measure.contents = '||'; w -= measure.width;
            measure.contents = glyph;
            var copy = measure.duplicate(), g = copy.createOutline(), b = g.geometricBounds;
            var result = {w:w, left:b[0], top:b[1], bottom:b[3]};
            g.remove(); metrics[id] = result; return result;
        }
        for (i = 0; i < definitions.length(); i++) {
            var f = definitions[i], id = Number(f.@slot), placed = null;
            for (j = 0; j < group.placedItems.length; j++) {
                var item = group.placedItems[j];
                try { if (item.tags.getByName('LaTeX2AIFlowSlot').value === String(id)) { placed = item; break; } } catch (unused) {}
            }
            if (placed) slots[id] = {xml:f, art:placed};
        }
        for (i = 0; i < tf.characters.length; i++) {
            var ch = tf.characters[i], slot = ch.contents.charCodeAt(0) - 0xE000;
            if (!slots[slot]) {
                // Typing immediately after an invisible anchor can inherit its
                // no-fill and enlarged advance. Restore normal editable prose.
                if(ch.characterAttributes.fillColor.typename==='NoColor') {
                    ch.characterAttributes.fillColor=black;
                    ch.characterAttributes.horizontalScale=100;
                }
                continue;
            }
            var entry = slots[slot], attr = ch.characterAttributes, size = attr.size;
            // Match capital height, not unrelated Times/Computer Modern em boxes.
            var bodyFont = i > 0 ? tf.characters[i-1].characterAttributes.textFont.name : 'TimesNewRomanPSMT';
            if (i > 0 && tf.characters[i-1].contents.charCodeAt(0) >= 0xE000) bodyFont = 'TimesNewRomanPSMT';
            var cap = reference('H', bodyFont).top - reference('H', bodyFont).bottom;
            var scale = size / Number(meta.@font) * (cap / 100 * Number(meta.@font) / Number(entry.xml.@cap));
            var pa = ch.paragraphAttributes;
            var available = Math.max(12, tf.textPath.width - (tf.spacing || 0) * 2 - pa.leftIndent - pa.rightIndent - Math.max(0,pa.firstLineIndent) - 4);
            var w = Number(entry.xml.@w), h = Number(entry.xml.@h), d = Number(entry.xml.@d);
            scale = Math.min(scale, available / Math.max(1, w));
            var glyph = ch.contents, ref = reference(glyph, markerFont.name);
            attr.textFont = markerFont;
            attr.horizontalScale = Math.max(1, (w * scale + 1) / (ref.w * size / 100) * 100);
            attr.verticalScale = 100; attr.tracking = 0;
            attr.fillColor = noColor; attr.strokeColor = noColor;
            attr.autoLeading = false; attr.leading = Math.max(size * 1.35, (h + d) * scale + size * 0.25);
            entry.index = i; entry.scale = scale; entry.ref = ref; entry.size = size; entry.hs = attr.horizontalScale;
            entry.art.hidden = false; found[slot] = entry;
        }
        for (var absent in slots) if (!found[absent]) slots[absent].art.hidden = true;
        // Leading belongs to the incoming line. Reserve the previous formula's
        // descent as well, so a tall fraction cannot collide with the next line.
        // Derive it from type size each time, including after a font-size edit.
        tf.textRange.characterAttributes.autoLeading = true;
        tf.textRange.paragraphAttributes.autoLeadingAmount = 135;
        // Grow area text when narrower wrapping or larger type would overset.
        for (i = 0; i < 8; i++) {
            var lines = tf.lines;
            if (lines.length && lines[lines.length-1].end >= tf.textRange.end) break;
            if (tf.textPath.height >= 12000) throw new Error('Paragraph exceeds the supported frame height. Split the paragraph.');
            tf.textPath.height = Math.min(12000, Math.max(100, tf.textPath.height * 1.7));
        }
        var previousDepth = 0;
        for (i=0;i<tf.lines.length;i++) {
            var line=tf.lines[i], ascent=0, depth=0, sizeMax=0;
            for(j=0;j<line.characters.length;j++) {
                var lc=line.characters[j], ls=lc.characterAttributes.size;
                var le=found[lc.contents.charCodeAt(0)-0xE000];
                sizeMax=Math.max(sizeMax,ls);
                ascent=Math.max(ascent,le?Number(le.xml.@h)*le.scale:ls*0.9);
                depth=Math.max(depth,le?Number(le.xml.@d)*le.scale:ls*0.25);
            }
            line.characterAttributes.autoLeading=false;
            line.characterAttributes.leading=Math.max(sizeMax*1.35,previousDepth+ascent+sizeMax*0.18);
            previousDepth=depth;
        }
        // Increased leading may overset the last lines.
        for(i=0;i<8;i++) {
            var visible=tf.lines;
            if(visible.length && visible[visible.length-1].end>=tf.textRange.end)break;
            if(tf.textPath.height>=12000)throw new Error('Paragraph exceeds the supported frame height.');
            tf.textPath.height=Math.min(12000,Math.max(100,tf.textPath.height*1.7));
        }
        duplicate = tf.duplicate(); duplicate.selected = false;
        for (var slotId in found) {
            var markerColor;
            if(doc.documentColorSpace===DocumentColorSpace.CMYK){
                markerColor=new CMYKColor();markerColor.cyan=97;markerColor.magenta=Number(slotId);markerColor.yellow=3;markerColor.black=0;
            }else{
                markerColor=new RGBColor();markerColor.red=253;markerColor.green=1;markerColor.blue=Number(slotId)+1;
            }
            duplicate.characters[found[slotId].index].characterAttributes.fillColor = markerColor;
        }
        outline = duplicate.createOutline(); duplicate = null;
        var boxes = {};
        function visit(art) {
            var n, color, id, b, old;
            if (art.typename === 'GroupItem') { for (n=0;n<art.pageItems.length;n++) visit(art.pageItems[n]); }
            else if (art.typename === 'CompoundPathItem') { for(n=0;n<art.pathItems.length;n++) visit(art.pathItems[n]); }
            else if (art.typename === 'PathItem') {
                color = art.fillColor;
                if(color.typename==='RGBColor'&&Math.abs(color.red-253)<0.1&&Math.abs(color.green-1)<0.1)id=Math.round(color.blue)-1;
                else if(color.typename==='CMYKColor'&&Math.abs(color.cyan-97)<0.1&&Math.abs(color.yellow-3)<0.1&&color.black<0.1)id=Math.round(color.magenta);
                else return;
                if (!found[id]) return;
                b = art.geometricBounds; old = boxes[id];
                boxes[id] = old ? [Math.min(old[0],b[0]),Math.max(old[1],b[1]),Math.max(old[2],b[2]),Math.min(old[3],b[3])] : b;
            }
        }
        visit(outline);
        var bottom = outline.pageItems.length ? outline.geometricBounds[3] : tf.top - Number(meta.@font);
        for (var index in found) {
            var e = found[index], bounds = boxes[index];
            if (!bounds) throw new Error('A formula anchor is overset. Widen the text frame.');
            var x = bounds[0] - e.ref.left * e.size / 100 * e.hs / 100;
            var baseline = bounds[1] - e.ref.top * e.size / 100;
            // kAsIs native items enforce their natural PDF box. Set their matrix
            // explicitly after clearing the stale box retained by relink.
            var natural=e.art.boundingBox, matrix=e.art.matrix;
            e.art.width=Math.abs(natural[2]-natural[0]);
            e.art.height=Math.abs(natural[1]-natural[3]);
            matrix.mValueA=e.scale;matrix.mValueB=0;
            matrix.mValueC=0;matrix.mValueD=-e.scale;e.art.matrix=matrix;
            e.art.position = [x - border * e.scale, baseline + (Number(e.xml.@h) + border) * e.scale];
            bottom = Math.min(bottom, baseline - Number(e.xml.@d) * e.scale);
        }
        // Native area text supports paragraph alignment and direct width edits.
        // Fit height after measuring; never scale text to change the width.
        var desiredHeight = Math.max(Number(meta.@font) * 2, tf.top - bottom + Number(meta.@font) * 0.4);
        if (Math.abs(tf.textPath.height - desiredHeight) > 0.5) tf.textPath.height = desiredHeight;
        var finalSignature=l2aFlowSignature(tf), signatureTag;
        try{signatureTag=tf.tags.getByName('LaTeX2AIFlowSignature');}
        catch(newSignature){signatureTag=tf.tags.add();signatureTag.name='LaTeX2AIFlowSignature';}
        signatureTag.value=finalSignature;
        $.global.l2aFlowCache[key] = {done:finalSignature};
        return true;
    } finally {
        if (outline) outline.remove();
        if (duplicate) duplicate.remove();
        if (measure) measure.remove();
    }
}
function l2aFlowTick() {
    if (!app.documents.length) return 'IDLE';
    var doc = app.activeDocument, frames = [], i, count = 0;
    // Inspect only tagged text frames; do not traverse every poster object.
    for (i=0;i<doc.textFrames.length;i++) {
        var tf=doc.textFrames[i];
        if (tf.note.indexOf('<l2a_flow ') === 0 && !tf.locked && !tf.hidden && tf.editable) frames.push(tf);
    }
    for (i=0;i<frames.length;i++) if(l2aFlowLayout(frames[i],false)) count++;
    return 'OK:'+count;
}
