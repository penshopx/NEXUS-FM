import { motion } from 'framer-motion';
import logo from '@assets/nexus-fm-logo.svg';

export function Scene0() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* OS Boot Sequence Element */}
      <motion.div
        className="absolute top-10 left-10 font-mono text-[1.5vw] text-primary/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, repeat: 10, repeatType: "reverse" }}
        >
          _
        </motion.span>
        INITIALIZING KERNEL...
      </motion.div>

      <motion.div
        className="relative flex flex-col items-center"
        initial={{ scale: 0.8, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      >
        <div className="relative mb-[4vw]">
          <motion.div
            className="absolute inset-0 bg-primary rounded-full blur-[80px] opacity-30"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.img 
            src={logo} 
            alt="NEXUS-FM" 
            className="w-[15vw] h-[15vw] relative z-10"
            initial={{ rotate: -15, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 1.5, type: "spring", bounce: 0.4 }}
          />
        </div>

        <div className="overflow-hidden">
          <motion.h1 
            className="text-[8vw] font-display font-bold leading-none tracking-tight text-foreground"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
          >
            NEXUS-FM
          </motion.h1>
        </div>

        <div className="overflow-hidden mt-[2vw]">
          <motion.div
            className="flex items-center gap-[1.5vw] text-[2vw] font-mono text-primary tracking-widest uppercase"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 1 }}
          >
            <div className="w-[4vw] h-[2px] bg-primary" />
            <span>Digital Evidence-Based OS</span>
            <div className="w-[4vw] h-[2px] bg-primary" />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
