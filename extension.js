/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import IBus from 'gi://IBus';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InputMethod} from 'resource:///org/gnome/shell/misc/inputMethod.js';

export default class AddPreeditHighlightExtension extends Extension {
    enable() {
        this._encoder = new TextEncoder();
        this._injectionManager = new InjectionManager();
        this._inputContext = null;
        this._preeditVisible = false;
        this._preeditAnchor = 0;
        this._originalSetPreeditText = InputMethod.prototype['set_preedit_text'].bind(Main.inputMethod);

        this._injectionManager.overrideMethod(
            InputMethod.prototype,
            'set_preedit_text',
            originalMethod => {
                const connect = this._connectWithInputContext.bind(this);
                return function (preedit, cursor, anchor, mode) {
                    connect();
                    if (preedit === null && cursor === 0 && anchor === 0)  // on focus out
                        originalMethod.call(this, null, 0, 0, mode);
                    if (this === Main.inputMethod)
                        return;
                    originalMethod.call(this, preedit, cursor, anchor, mode);
                };
            }
        );
    }

    disable() {
        this._encoder = null;
        this._injectionManager.clear();
        this._injectionManager = null;
        this._inputContext?.disconnect(this._updatePreeditTextWithModeID);
        this._inputContext?.disconnect(this._showPreeditTextID);
        this._inputContext?.disconnect(this._hidePreeditTextID);
    }

    _connectWithInputContext() {
        if (this._inputContext === Main.inputMethod._context || !Main.inputMethod._context)
            return;
        this._inputContext = Main.inputMethod._context;

        this._updatePreeditTextWithModeID = this._inputContext.connect(
            'update-preedit-text-with-mode',
            this._onUpdatePreeditText.bind(this),
        );

        this._showPreeditTextID = this._inputContext.connect(
            'show-preedit-text',
            this._onShowPreeditText.bind(this),
        );

        this._hidePreeditTextID = this._inputContext.connect(
            'hide-preedit-text',
            this._onHidePreeditText.bind(this),
        );
    }

    _onUpdatePreeditText(_context, text, pos, visible, mode) {
        if (text == null)
            return;

        let preedit = text.get_text();
        if (preedit === '')
            preedit = null;

        let anchor = pos;

        if (preedit) {
            const attrs = text.get_attributes();
            const ranges = [];
            let attr;

            for (let i = 0; (attr = attrs.get(i)); ++i) {
                if (attr.get_attr_type() === IBus.AttrType.BACKGROUND)
                    ranges.push([attr.get_start_index(), attr.get_end_index()]);
            }
            ranges.sort((a, b) => a[0] - b[0]);

            if (ranges.length > 0 && ranges[0][0] === pos) {
                ranges.forEach(x => {
                    const [start, end] = x;
                    if (start <= anchor)
                        anchor = Math.max(anchor, end);
                });
            }
        }

        if (visible)
            this._originalSetPreeditText(preedit, pos, anchor, mode);
        else if (this._preeditVisible)
            this._originalSetPreeditText(null, pos, anchor, mode);

        this._preeditAnchor = anchor;
        this._preeditVisible = visible;
    }

    _onShowPreeditText() {
        this._preeditVisible = true;
        this._originalSetPreeditText(
            Main.inputMethod._preeditStr, Main.inputMethod._preeditPos, this._preeditAnchor,
            Main.inputMethod._preeditCommitMode);
    }

    _onHidePreeditText() {
        this._originalSetPreeditText(
            null, Main.inputMethod._preeditPos, this._preeditAnchor,
            Main.inputMethod._preeditCommitMode);
        this._preeditVisible = false;
    }
}
