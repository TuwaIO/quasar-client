import { MotionGlobalConfig } from 'framer-motion';

// The story tests check each story with axe once it has rendered: without animations the dialogs and toasts are at
// their final opacity then, not halfway through fading in (which axe would read as low contrast)
MotionGlobalConfig.skipAnimations = true;
