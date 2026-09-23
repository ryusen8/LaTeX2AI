// SPDX-License-Identifier: MIT
// Area text owns wrapping/alignment. Invisible private-use characters reserve
// the advance of linked formulas; a temporary outline locates their baselines.
// Original prose and formula objects are never outlined.
if (!$.global.l2aFlowCache) $.global.l2aFlowCache = {};
function l2aFlowTag(item,name,value) {
    var tag;
    try{tag=item.tags.getByName(name);}catch(missing){if(value===undefined)return '';tag=item.tags.add();tag.name=name;}
    if(value!==undefined)tag.value=value;
    return tag.value;
}
function l2aFlowMetadata(tf) {
    var data=l2aFlowTag(tf,'L2AFlowMetadata');
    if(!data && tf.note.indexOf('<l2a_flow ')===0){
        data=tf.note;l2aFlowTag(tf,'L2AFlowMetadata',data);tf.note='';
        // The v0.0.10 native runtime treats ANY art named LaTeX2AI* as a
        // formula, including area text. Never use that prefix on prose.
        if(tf.name.indexOf('LaTeX2AI')===0)tf.name='Flow paragraph text';
    }
    if(data){
        var meta=new XML(data);
        if(String(meta.@placement)!=='conform'){
            for(var i=0;i<tf.parent.placedItems.length;i++){
                var art=tf.parent.placedItems[i];if(l2aFlowTag(art,'LaTeX2AIFlowSlot')==='')continue;
                var nativeNote=new XML(art.note);
                if(String(nativeNote.name())==='LaTeX2AI_item'){nativeNote.@placed_option='fill_to_boundary_box';art.note=nativeNote.toXMLString();}
            }
            meta.@placement='conform';data=meta.toXMLString();l2aFlowTag(tf,'L2AFlowMetadata',data);
        }
    }
    return data;
}
function l2aFlowPoint(m,p){return [m.mValueA*p[0]+m.mValueC*p[1]+m.mValueTX,m.mValueB*p[0]+m.mValueD*p[1]+m.mValueTY];}
function l2aFlowLinear(source){var m=app.getIdentityMatrix();m.mValueA=source.mValueA;m.mValueB=source.mValueB;m.mValueC=source.mValueC;m.mValueD=source.mValueD;return m;}
function l2aFlowProduct(x,y){
    var m=app.getIdentityMatrix();
    m.mValueA=x.mValueA*y.mValueA+x.mValueC*y.mValueB;m.mValueB=x.mValueB*y.mValueA+x.mValueD*y.mValueB;
    m.mValueC=x.mValueA*y.mValueC+x.mValueC*y.mValueD;m.mValueD=x.mValueB*y.mValueC+x.mValueD*y.mValueD;
    m.mValueTX=x.mValueA*y.mValueTX+x.mValueC*y.mValueTY+x.mValueTX;m.mValueTY=x.mValueB*y.mValueTX+x.mValueD*y.mValueTY+x.mValueTY;return m;
}
function l2aFlowBasis(points){
    var m=app.getIdentityMatrix(),p=points[0],u=points[1],v=points[2];
    m.mValueA=u[0]-p[0];m.mValueB=u[1]-p[1];m.mValueC=v[0]-p[0];m.mValueD=v[1]-p[1];m.mValueTX=p[0];m.mValueTY=p[1];return m;
}
function l2aFlowSnapshot(tf){
    var state=new XML('<state/>'),i,p,art,b,m,f;
    state.@contents=tf.contents;
    for(i=0;i<tf.textPath.pathPoints.length;i++){
        p=tf.textPath.pathPoints[i].anchor;var point=new XML('<point/>');point.@x=p[0];point.@y=p[1];state.appendChild(point);
    }
    for(i=0;i<tf.parent.placedItems.length;i++){
        art=tf.parent.placedItems[i];var slot=l2aFlowTag(art,'LaTeX2AIFlowSlot');if(slot==='')continue;
        b=art.geometricBounds;m=art.matrix;f=new XML('<art/>');f.@slot=slot;f.@x=(b[0]+b[2])/2;f.@y=(b[1]+b[3])/2;
        f.@a=m.mValueA;f.@b=m.mValueB;f.@c=m.mValueC;f.@d=m.mValueD;state.appendChild(f);
    }
    return state;
}
function l2aFlowWholeTransform(tf,state){
    // If the text boundary AND all linked formulas underwent the same affine
    // transform, Illustrator has already done the right thing. Do not reflow,
    // resize the frame or replace the user's transform with horizontal art.
    if(String(state.@contents)!==tf.contents||state.point.length()!==tf.textPath.pathPoints.length||state.point.length()<3)return false;
    var old=[],now=[],i,p,delta;
    for(i=0;i<state.point.length();i++){old.push([Number(state.point[i].@x),Number(state.point[i].@y)]);now.push(tf.textPath.pathPoints[i].anchor);}
    try{delta=l2aFlowProduct(l2aFlowBasis(now),app.invertMatrix(l2aFlowBasis(old)));}catch(singular){return false;}
    if(Math.abs(delta.mValueA-1)+Math.abs(delta.mValueD-1)+Math.abs(delta.mValueB)+Math.abs(delta.mValueC)+Math.abs(delta.mValueTX)+Math.abs(delta.mValueTY)<0.001)return false;
    for(i=0;i<old.length;i++){p=l2aFlowPoint(delta,old[i]);if(Math.abs(p[0]-now[i][0])+Math.abs(p[1]-now[i][1])>0.05)return false;}
    var tested=0;
    for(i=0;i<tf.parent.placedItems.length;i++){
        var art=tf.parent.placedItems[i],slot=l2aFlowTag(art,'LaTeX2AIFlowSlot'),f=null,j;
        if(slot==='')continue;
        for(j=0;j<state.art.length();j++)if(String(state.art[j].@slot)===slot){f=state.art[j];break;}
        if(!f)return false;
        var b=art.geometricBounds,m=art.matrix,o=app.getIdentityMatrix();
        o.mValueA=Number(f.@a);o.mValueB=Number(f.@b);o.mValueC=Number(f.@c);o.mValueD=Number(f.@d);
        // PlacedItem matrices use Illustrator's downward PDF Y axis, while
        // TextPath anchors are in upward document coordinates.
        var placedDelta=l2aFlowLinear(delta);placedDelta.mValueB*=-1;placedDelta.mValueC*=-1;
        var expected=l2aFlowProduct(placedDelta,o);p=l2aFlowPoint(delta,[Number(f.@x),Number(f.@y)]);
        // kAsIs placed art can recompute its PDF bounding box on a scale or
        // shear, so its bounds center is not a stable affine reference. The
        // actual linear matrix is authoritative. Pure moves can use centers.
        var onlyMove=Math.abs(delta.mValueA-1)+Math.abs(delta.mValueD-1)+Math.abs(delta.mValueB)+Math.abs(delta.mValueC)<0.001;
        if(onlyMove && Math.abs(p[0]-(b[0]+b[2])/2)+Math.abs(p[1]-(b[1]+b[3])/2)>0.1)return false;
        if(Math.abs(m.mValueA-expected.mValueA)+Math.abs(m.mValueB-expected.mValueB)+Math.abs(m.mValueC-expected.mValueC)+Math.abs(m.mValueD-expected.mValueD)>0.002)return false;
        tested++;
    }
    return tested>0;
}
function l2aFlowRemember(tf){
    var signature=l2aFlowSignature(tf);
    l2aFlowTag(tf,'LaTeX2AIFlowSignature',signature);
    l2aFlowTag(tf,'L2AFlowGeometry',l2aFlowSnapshot(tf).toXMLString());
    if(l2aFlowTag(tf,'L2AFlowLeadingMode')!=='native')
        l2aFlowTag(tf,'L2AFlowLeadingState',l2aFlowLeadingState(tf));
    $.global.l2aFlowCache[tf.uuid]={done:signature};
}
function l2aFlowLeadingState(tf){
    var state=new XML('<leading/>'),values=[];
    state.@text=tf.contents;
    for(var i=0;i<tf.characters.length;i++){
        var c=tf.characters[i],a=c.characterAttributes;
        values.push([a.size,a.leading,a.autoLeading?1:0,c.paragraphAttributes.autoLeadingAmount].join(','));
    }
    state.@values=values.join(';');return state.toXMLString();
}
function l2aFlowLeadingChanged(tf){
    if(l2aFlowTag(tf,'L2AFlowLeadingMode')==='native')return false;
    var stored=l2aFlowTag(tf,'L2AFlowLeadingState');if(!stored)return false;
    var state=new XML(stored),oldText=String(state.@text),text=tf.contents,old=String(state.@values).split(';');
    // Match unchanged text on either side of a typing/deletion operation.
    // Inherited formatting on newly inserted characters is not a user override.
    var prefix=0,suffix=0,i;
    while(prefix<Math.min(oldText.length,text.length)&&oldText.charAt(prefix)===text.charAt(prefix))prefix++;
    while(suffix<Math.min(oldText.length,text.length)-prefix&&oldText.charAt(oldText.length-1-suffix)===text.charAt(text.length-1-suffix))suffix++;
    function changed(current,previous){
        if(!old[previous]||current>=tf.characters.length)return false;
        var before=old[previous].split(','),c=tf.characters[current],a=c.characterAttributes;
        if((a.autoLeading?1:0)!==Number(before[2]))return true;
        if(Math.abs(c.paragraphAttributes.autoLeadingAmount-Number(before[3]))>0.01)return true;
        // Illustrator can scale leading with type size. A font-size change is
        // not itself an explicit line-spacing edit; whole-group transforms are
        // already handled before this check.
        return !a.autoLeading&&Math.abs(a.size-Number(before[0]))<0.01&&Math.abs(a.leading-Number(before[1]))>0.01;
    }
    for(i=0;i<prefix;i++)if(changed(i,i))return true;
    for(i=0;i<suffix;i++)if(changed(text.length-1-i,oldText.length-1-i))return true;
    return false;
}
function l2aFlowLocalHeight(tf){
    var m=l2aFlowLinear(tf.matrix),inv=app.invertMatrix(m);
    var p=l2aFlowPoint(inv,tf.textPath.pathPoints[0].anchor),q=l2aFlowPoint(inv,tf.textPath.pathPoints[1].anchor);
    return Math.abs(q[1]-p[1]);
}
function l2aFlowFrame(tf){
    var m=l2aFlowLinear(tf.matrix),inv=app.invertMatrix(m),points=[],i;
    for(i=0;i<tf.textPath.pathPoints.length;i++)points.push(l2aFlowPoint(inv,tf.textPath.pathPoints[i].anchor));
    return {matrix:m,inverse:inv,points:points,width:Math.abs(points[2][0]-points[1][0]),height:Math.abs(points[1][1]-points[0][1]),top:points[1][1]};
}
function l2aFlowSetHeight(tf,height){
    var frame=l2aFlowFrame(tf),i;
    for(i=0;i<frame.points.length;i++)if(i===0||i===3){
        var pt=tf.textPath.pathPoints[i],p=l2aFlowPoint(frame.matrix,[frame.points[i][0],frame.top-height]);
        pt.anchor=p;pt.leftDirection=p;pt.rightDirection=p;
    }
}
function l2aFlowRect(m,left,top,right,bottom){
    var points=[[left,top],[right,top],[right,bottom],[left,bottom]],out=[Infinity,-Infinity,-Infinity,Infinity];
    for(var i=0;i<points.length;i++){var p=l2aFlowPoint(m,points[i]);out[0]=Math.min(out[0],p[0]);out[1]=Math.max(out[1],p[1]);out[2]=Math.max(out[2],p[0]);out[3]=Math.min(out[3],p[1]);}return out;
}
function l2aFlowSignature(tf) {
    var out = [tf.contents, tf.textPath.width, tf.textPath.height, tf.left, tf.top], i, a;
    var m=tf.matrix;out.push(m.mValueA,m.mValueB,m.mValueC,m.mValueD);
    for(i=0;i<tf.textPath.pathPoints.length;i++){var point=tf.textPath.pathPoints[i].anchor;out.push(point[0],point[1]);}
    for (i = 0; i < tf.characters.length; i++) {
        a = tf.characters[i].characterAttributes;
        out.push(a.size, a.textFont.name, a.horizontalScale, a.verticalScale, a.tracking, a.baselineShift, a.leading, a.fillColor.typename, a.autoLeading);
    }
    for (i = 0; i < tf.paragraphs.length; i++) {
        a = tf.paragraphs[i].paragraphAttributes;
        out.push(a.justification, a.leftIndent, a.rightIndent, a.firstLineIndent, a.spaceBefore, a.spaceAfter, a.autoLeadingAmount);
    }
    // Illustrator rounds character attributes when serializing an AI file.
    // Ignore sub-millipoint drift instead of rewriting unchanged reopened art.
    for(i=0;i<out.length;i++)if(typeof out[i]==='number')out[i]=Math.round(out[i]*1000)/1000;
    return out.join('|');
}
function l2aFlowLayout(tf, force, initialFit) {
    var data=l2aFlowMetadata(tf);if(!data)return false;
    // Establish a baseline for existing documents without rewriting their
    // typography merely because this version adds line-spacing tracking.
    if(!force&&!l2aFlowTag(tf,'L2AFlowLeadingState')&&l2aFlowTag(tf,'L2AFlowLeadingMode')!=='native'){
        l2aFlowRemember(tf);return false;
    }
    var geometry=l2aFlowTag(tf,'L2AFlowGeometry');
    if(!geometry&&!force){l2aFlowTag(tf,'L2AFlowHeight',String(l2aFlowLocalHeight(tf)));l2aFlowRemember(tf);return false;}
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
    var wholeTransform=!force && geometry && l2aFlowWholeTransform(tf,new XML(geometry));
    var lastHeight=Number(l2aFlowTag(tf,'L2AFlowHeight')),height=l2aFlowLocalHeight(tf);
    if(wholeTransform){l2aFlowTag(tf,'L2AFlowHeight',String(height));l2aFlowRemember(tf);return true;}
    if(l2aFlowLeadingChanged(tf))l2aFlowTag(tf,'L2AFlowLeadingMode','native');
    if(!wholeTransform&&!initialFit&&lastHeight&&Math.abs(height-lastHeight)>0.1)l2aFlowTag(tf,'L2AFlowManualHeight','1');
    l2aFlowLayoutLocal(tf,!wholeTransform&&(initialFit||l2aFlowTag(tf,'L2AFlowManualHeight')!=='1'),l2aFlowTag(tf,'L2AFlowLeadingMode')!=='native');
    l2aFlowTag(tf,'L2AFlowHeight',String(l2aFlowLocalHeight(tf)));
    l2aFlowRemember(tf);return true;
}
function l2aFlowLayoutLocal(tf,autoHeight,managedLeading) {
    var meta=new XML(l2aFlowMetadata(tf)),group=tf.parent,doc=app.activeDocument;
    var frame=l2aFlowFrame(tf),orientation=frame.matrix;
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
            var result = {w:w, left:b[0],right:b[2], top:b[1], bottom:b[3]};
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
            var bodyAttr=null;
            for(j=i-1;j>=0;j--)if(tf.characters[j].contents.charCodeAt(0)<0xE000){bodyAttr=tf.characters[j].characterAttributes;break;}
            if(!bodyAttr)for(j=i+1;j<tf.characters.length;j++)if(tf.characters[j].contents.charCodeAt(0)<0xE000){bodyAttr=tf.characters[j].characterAttributes;break;}
            var bodyFont=bodyAttr?bodyAttr.textFont.name:'TimesNewRomanPSMT';
            var cap = reference('H', bodyFont).top - reference('H', bodyFont).bottom;
            var scale = size / Number(meta.@font) * (cap / 100 * Number(meta.@font) / Number(entry.xml.@cap));
            var pa = ch.paragraphAttributes;
            var available = Math.max(12, frame.width - (tf.spacing || 0) * 2 - pa.leftIndent - pa.rightIndent - Math.max(0,pa.firstLineIndent) - 4);
            var w = Number(entry.xml.@w), h = Number(entry.xml.@h), d = Number(entry.xml.@d);
            var scaleX=scale*(bodyAttr?bodyAttr.horizontalScale:100)/100;
            var scaleY=scale*(bodyAttr?bodyAttr.verticalScale:100)/100;
            var shrink=Math.min(1,available/Math.max(1,w*scaleX));scaleX*=shrink;scaleY*=shrink;
            var glyph = ch.contents, ref = reference(glyph, markerFont.name);
            attr.textFont = markerFont;
            attr.horizontalScale = Math.max(1, (w * scaleX + 1) / (ref.w * size / 100) * 100);
            attr.verticalScale = 100; attr.tracking = 0;
            attr.fillColor = noColor; attr.strokeColor = noColor;
            if(managedLeading){attr.autoLeading=false;attr.leading=Math.max(size*1.35,(h+d)*scale+size*0.25);}
            entry.index = i; entry.scale = scaleY;entry.scaleX=scaleX; entry.ref = ref; entry.size = size; entry.hs = attr.horizontalScale;
            entry.art.hidden = false; found[slot] = entry;
        }
        for (var absent in slots) if (!found[absent]) slots[absent].art.hidden = true;
        // Leading belongs to the incoming line. Reserve the previous formula's
        // descent as well, so a tall fraction cannot collide with the next line.
        // Derive it from type size each time, including after a font-size edit.
        if(managedLeading){
            tf.textRange.characterAttributes.autoLeading=true;
            tf.textRange.paragraphAttributes.autoLeadingAmount=135;
        }
        // Grow area text when narrower wrapping or larger type would overset.
        for (i = 0; autoHeight && i < 8; i++) {
            var lines = tf.lines;
            if (lines.length && lines[lines.length-1].end >= tf.textRange.end) break;
            if (l2aFlowLocalHeight(tf) >= 12000) throw new Error('Paragraph exceeds the supported frame height. Split the paragraph.');
            l2aFlowSetHeight(tf,Math.min(12000, Math.max(100, l2aFlowLocalHeight(tf) * 1.7)));
        }
        var previousDepth = 0;
        for (i=0;managedLeading && i<tf.lines.length;i++) {
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
        for(i=0;autoHeight && i<8;i++) {
            var visible=tf.lines;
            if(visible.length && visible[visible.length-1].end>=tf.textRange.end)break;
            if(l2aFlowLocalHeight(tf)>=12000)throw new Error('Paragraph exceeds the supported frame height.');
            l2aFlowSetHeight(tf,Math.min(12000,Math.max(100,l2aFlowLocalHeight(tf)*1.7)));
        }
        if(!tf.lines.length){for(var invisibleSlot in found)found[invisibleSlot].art.hidden=true;return true;}
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
        var boxes = {},bottom=frame.top;
        function visit(art) {
            var n, color, id, b, old;
            if (art.typename === 'GroupItem') { for (n=0;n<art.pageItems.length;n++) visit(art.pageItems[n]); }
            else if (art.typename === 'CompoundPathItem') { for(n=0;n<art.pathItems.length;n++) visit(art.pathItems[n]); }
            else if (art.typename === 'PathItem') {
                for(n=0;n<art.pathPoints.length;n++)bottom=Math.min(bottom,l2aFlowPoint(frame.inverse,art.pathPoints[n].anchor)[1]);
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
        for (var index in found) {
            var e = found[index], bounds = boxes[index];
            if (!bounds) {if(!autoHeight){e.art.hidden=true;continue;}throw new Error('A formula anchor is overset. Widen the text frame.');}
            var glyphBox=l2aFlowRect(orientation,e.ref.left*e.size/100*e.hs/100,e.ref.top*e.size/100,e.ref.right*e.size/100*e.hs/100,e.ref.bottom*e.size/100);
            var x=bounds[0]-glyphBox[0],baseline=bounds[1]-glyphBox[1];
            // kAsIs native items enforce their natural PDF box. Set their matrix
            // explicitly after clearing the stale box retained by relink.
            var natural=e.art.boundingBox, matrix=e.art.matrix;
            e.art.width=Math.abs(natural[2]-natural[0]);
            e.art.height=Math.abs(natural[1]-natural[3]);
            matrix.mValueA=orientation.mValueA*e.scaleX;matrix.mValueB=-orientation.mValueB*e.scaleX;
            matrix.mValueC=orientation.mValueC*e.scale;matrix.mValueD=-orientation.mValueD*e.scale;e.art.matrix=matrix;
            var pdfBox=l2aFlowRect(orientation,-border*e.scaleX,(Number(e.xml.@h)+border)*e.scale,(Number(e.xml.@w)+border)*e.scaleX,-(Number(e.xml.@d)+border)*e.scale);
            e.art.position = [x+pdfBox[0],baseline+pdfBox[1]];
            bottom = Math.min(bottom, l2aFlowPoint(frame.inverse,[x,baseline])[1] - Number(e.xml.@d) * e.scale);
        }
        // Native area text supports paragraph alignment and direct width edits.
        // Fit height after measuring; never scale text to change the width.
        var desiredHeight = Math.max(Number(meta.@font) * 2, frame.top - bottom + Number(meta.@font) * 0.4);
        if (autoHeight && Math.abs(l2aFlowLocalHeight(tf) - desiredHeight) > 0.5) l2aFlowSetHeight(tf,desiredHeight);
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
        if (!tf.locked && !tf.hidden && tf.editable && l2aFlowMetadata(tf)) frames.push(tf);
    }
    for (i=0;i<frames.length;i++) if(l2aFlowLayout(frames[i],false)) count++;
    return 'OK:'+count;
}
