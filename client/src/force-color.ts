// client/src/force-color.ts
// Must be imported BEFORE gradient-string (or any chalk-based library).
//
// gradient-string uses chalk internally. chalk's vendored supports-color
// caches its color level at module evaluation time by reading FORCE_COLOR
// from process.env. ESM import declarations are hoisted and evaluated
// before the importing module's body runs, so we need FORCE_COLOR to be
// set in a module that is evaluated first.
//
// This module is imported by sprites.ts before the gradient-string import.

import { supportsGradient } from './terminal'

if (supportsGradient()) {
  process.env.FORCE_COLOR = '3'
}
