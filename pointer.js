// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
// 0.3.52: remembers only WHERE the user last right-clicked, so "improve translation" knows which
// paragraph was meant. Nothing is read or sent until the user chooses the menu item.
addEventListener('contextmenu',e=>{globalThis.__dtsLastContext=e.target;},true);
