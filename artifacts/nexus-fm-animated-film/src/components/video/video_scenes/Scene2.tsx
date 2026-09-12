import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 0, x: '10%' }}
      animate={{ opacity: 1, x: '0%' }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-[8vw] left-[8vw] font-mono text-[1.5vw] text-primary">
        // WORKFLOW INTEGRITY
      </div>

      <div className="relative w-full max-w-[80vw] h-[30vw] flex items-center justify-center">
        
        {/* COMPLETED State */}
        <motion.div
          className="absolute left-[10vw]"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 0.4, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="text-[5vw] font-display font-bold text-muted-foreground line-through decoration-destructive decoration-[0.5vw]">
            COMPLETED
          </div>
          <div className="font-mono text-[1.5vw] text-muted-foreground mt-[1vw]">
            STATUS: UNVERIFIED
          </div>
        </motion.div>

        {/* NOT EQUAL SIGN */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 text-[8vw] font-mono text-primary font-bold z-20"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.6, delay: 1 }}
        >
          ≠
        </motion.div>

        {/* VERIFIED / CLOSED State */}
        <motion.div
          className="absolute right-[10vw] flex flex-col items-end text-right"
          initial={{ opacity: 0, x: 50, filter: 'blur(10px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 1.5 }}
        >
          <div className="text-[5vw] font-display font-bold text-foreground">
            VERIFIED
          </div>
          <div className="text-[4vw] font-display font-bold text-primary mt-[-1vw]">
            / CLOSED
          </div>
          <motion.div 
            className="flex items-center gap-[1vw] mt-[2vw]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 2.2 }}
          >
            <div className="w-[1vw] h-[1vw] bg-primary rounded-full animate-pulse" />
            <div className="font-mono text-[1.5vw] text-primary">
              REQUIRES EVIDENCE
            </div>
          </motion.div>
        </motion.div>

      </div>

      {/* Decorative Evidence Blocks at bottom */}
      <motion.div 
        className="absolute bottom-[10vw] flex gap-[2vw]"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 2.5 }}
      >
        {[1, 2, 3].map((i) => (
          <motion.div 
            key={i}
            className="w-[12vw] h-[8vw] border-[1px] border-muted rounded-[1vw] flex flex-col p-[1vw] bg-secondary/50 backdrop-blur-sm"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-[3vw] h-[0.5vw] bg-muted-foreground/50 rounded-full mb-[1vw]" />
            <div className="w-full h-[0.5vw] bg-muted-foreground/20 rounded-full mb-[0.5vw]" />
            <div className="w-[80%] h-[0.5vw] bg-muted-foreground/20 rounded-full" />
            <motion.div 
              className="mt-auto self-end w-[2vw] h-[2vw] bg-primary/20 rounded-full flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2.8 + (i * 0.2), type: "spring" }}
            >
              <div className="w-[1vw] h-[1vw] bg-primary rounded-full" />
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

    </motion.div>
  );
}
