import { motion } from 'framer-motion';
import logo from '@assets/nexus-fm-logo.svg';

export function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background"
      initial={{ opacity: 0, filter: 'blur(20px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="relative flex flex-col items-center"
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative mb-[3vw]">
          <motion.div
            className="absolute inset-0 bg-primary rounded-full blur-[100px] opacity-20"
            animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.img 
            src={logo} 
            alt="NEXUS-FM" 
            className="w-[12vw] h-[12vw] relative z-10"
            initial={{ rotate: 15, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 1.5, type: "spring", bounce: 0.4, delay: 0.5 }}
          />
        </div>

        <div className="overflow-hidden">
          <motion.h1 
            className="text-[6vw] font-display font-bold leading-none tracking-tight text-foreground"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.8 }}
          >
            NEXUS-FM
          </motion.h1>
        </div>

        <div className="overflow-hidden mt-[1vw]">
          <motion.div
            className="text-[1.8vw] font-mono text-muted-foreground tracking-widest uppercase"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 1.2 }}
          >
            Digital Evidence-Based OS
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
