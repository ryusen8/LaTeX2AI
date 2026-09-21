// SPDX-License-Identifier: MIT
// `job` is generated with escaped JS strings; no pasted content is evaluated.
(function () {
    if (job.done && new File(job.done).exists) return 'OK:already converted';
    var marker = '%L2A-EDITABLE-JOB:' + job.id;
    var doc = null, original = null, matches = 0, i, j;
    for (i = 0; i < app.documents.length; i++) {
        var candidate = app.documents[i];
        for (j = 0; j < candidate.placedItems.length; j++) {
            var p = candidate.placedItems[j];
            if (p.note.indexOf(marker) >= 0) { doc = candidate; original = p; matches++; }
        }
    }
    if (!matches) return 'WAIT';
    if (matches !== 1) return 'ERROR:Ambiguous paragraph target; no objects changed.';
    var group = null, committed = false, oldInteraction = app.userInteractionLevel;
    try {
        var font = app.textFonts.getByName('TimesNewRomanPSMT');
        doc.activate();
        // Create inside the same parent to preserve layer and stacking order.
        group = original.parent.groupItems.add();
        group.move(original, ElementPlacement.PLACEBEFORE);
        group.name = 'Building editable paragraph ' + job.id;
        group.note = 'LaTeX2AI editable paragraph\nWidth (pt): ' + job.width + '\nFont (pt): ' + job.font + '\n\n' + job.source;
        var left = original.left, top = original.top;
        var measure = doc.textFrames.pointText([0, 0]);
        measure.move(group, ElementPlacement.PLACEATEND);
        measure.textRange.characterAttributes.textFont = font;
        measure.textRange.characterAttributes.size = job.font;
        var black = new GrayColor(); black.gray = 100;
        function textWidth(s) {
            // Sentinels preserve leading/trailing whitespace in the measured advance.
            measure.contents = '|' + s + '|';
            var full = measure.width;
            measure.contents = '||';
            return full - measure.width;
        }
        var line = [], used = 0, pendingSpace = '', frames = 0, formulas = 0;
        function finishLine(display) {
            if (!line.length) return;
            var ascent = job.font * 0.85, descent = job.font * 0.25, n;
            for (n = 0; n < line.length; n++) if (line[n].kind !== 'text') {
                ascent = Math.max(ascent, line[n].h);
                descent = Math.max(descent, line[n].d);
            }
            var baseline = top - ascent, x = left + (display ? (job.width - used) / 2 : 0);
            for (n = 0; n < line.length; n++) {
                var item = line[n];
                if (item.kind === 'text') {
                    var tf = doc.textFrames.pointText([x, baseline]);
                    tf.move(group, ElementPlacement.PLACEATEND);
                    tf.contents = item.text;
                    tf.textRange.characterAttributes.textFont = font;
                    tf.textRange.characterAttributes.size = job.font;
                    tf.textRange.characterAttributes.fillColor = black;
                    frames++;
                } else {
                    // Copy a real native item, including its kAsIs/top-left placement
                    // options; a newly created generic PlacedItem would trigger warnings.
                    var placed = original.duplicate(group, ElementPlacement.PLACEATEND);
                    placed.note = item.note;
                    // Store alongside the native placeholder, with the native filename.
                    // The note also contains the encoded PDF, so it is self-recoverable.
                    var nativePath = original.file.fsName.replace(/\\/g, '/');
                    var suffix = nativePath.lastIndexOf('_LaTeX2AI_');
                    if (suffix < 0) throw new Error('Unexpected native formula link path.');
                    var target = new File(nativePath.substring(0, suffix + 10) + item.hash + '.pdf');
                    if (!target.exists && !(new File(item.file)).copy(target.fsName))
                        throw new Error('Could not save formula PDF in the document links directory.');
                    placed.relink(target);
                    placed.name = 'LaTeX2AI';
                    // Relink preserves the placeholder's old boundary box. Reset it
                    // to the PDF's natural size so selection/editing uses formula bounds.
                    var box = placed.boundingBox;
                    placed.width = Math.abs(box[2] - box[0]);
                    placed.height = Math.abs(box[1] - box[3]);
                    var matrix = placed.matrix;
                    matrix.mValueA = 1; matrix.mValueB = 0;
                    matrix.mValueC = 0; matrix.mValueD = -1;
                    placed.matrix = matrix;
                    // Both the native template and the precompiled PDF use 1 TeX pt border.
                    var border = 72 / 72.27;
                    placed.position = [x - border, baseline + item.h + border];
                    formulas++;
                }
                x += item.w;
            }
            top -= Math.max(job.font * 1.35, ascent + descent + job.font * 0.2);
            line = []; used = 0; pendingSpace = '';
        }
        function addText(s) {
            var last = line.length ? line[line.length - 1] : null;
            if (last && last.kind === 'text') {
                used -= last.w; last.text += s; last.w = textWidth(last.text); used += last.w;
            } else { var w = textWidth(s); line.push({kind:'text', text:s, w:w}); used += w; }
        }
        function addWord(s) {
            var prefix = line.length ? pendingSpace : '';
            var w = textWidth(prefix + s);
            if (line.length && used + w > job.width + 0.01) { finishLine(false); prefix = ''; }
            if (textWidth(s) > job.width + 0.01) throw new Error('A word is wider than the paragraph. Increase Width (mm).');
            addText(prefix + s); pendingSpace = '';
        }
        // Keep formulas linked with native LaTeX2AI properties; never embed or outline them.
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        for (i = 0; i < job.segments.length; i++) {
            var segment = job.segments[i];
            if (segment.kind === 'break') { finishLine(false); pendingSpace = ''; top -= job.font * 0.65; }
            else if (segment.kind === 'text') {
                var words = segment.text.match(/\s+|\S+/g) || [];
                for (j = 0; j < words.length; j++) {
                    if (/^\s+$/.test(words[j])) pendingSpace = ' ';
                    else addWord(words[j]);
                }
            } else if (segment.kind === 'display') {
                finishLine(false); pendingSpace = ''; top -= job.font * 0.4;
                line.push(segment); used = segment.w; finishLine(true); top -= job.font * 0.4;
            } else {
                var gap = line.length && pendingSpace ? textWidth(' ') : 0;
                if (line.length && used + gap + segment.w > job.width + 0.01) { finishLine(false); gap = 0; }
                if (gap) addText(' ');
                line.push(segment); used += segment.w; pendingSpace = '';
            }
        }
        finishLine(false);
        measure.remove();
        group.name = 'Editable paragraph ' + job.id;
        // Commit only after all text and formula artwork has been created.
        original.remove();
        committed = true;
        doc.selection = null; group.selected = true;
        if (job.done) { var done = new File(job.done); if (done.open('w')) { done.write('OK'); done.close(); } }
        app.redraw();
        return 'OK:textFrames=' + frames + ';formulas=' + formulas;
    } catch (error) {
        if (committed) return 'OK:textFrames=' + frames + ';formulas=' + formulas;
        if (group) { try { group.remove(); } catch (ignored) {} }
        return 'ERROR:' + error.message;
    } finally { app.userInteractionLevel = oldInteraction; }
})();
