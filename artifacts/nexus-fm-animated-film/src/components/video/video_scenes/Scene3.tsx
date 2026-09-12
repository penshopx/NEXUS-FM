import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-100%', filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-[8vw] right-[8vw] font-mono text-[1.5vw] text-primary text-right">
        // SCORING LOGIC
      </div>

      <div className="relative w-full max-w-[80vw] flex items-center justify-between">
        
        {/* Average Score Circle */}
        <motion.div 
          className="relative flex flex-col items-center"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <div className="relative w-[25vw] h-[25vw] rounded-full border-[2px] border-muted flex items-center justify-center overflow-hidden">
            {/* Liquid/Wave effect for score */}
            <motion.div 
              className="absolute bottom-0 w-[200%] h-[150%] bg-muted/20 rounded-[45%]"
              animate={{ rotate: 360, y: ["20%", "25%", "20%"] }}
              transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
            />
            <div className="relative z-10 text-[6vw] font-display font-bold text-muted-foreground">
              92%
            </div>
          </div>
          <div className="mt-[2vw] font-mono text-[1.5vw] text-muted-foreground">
            AVERAGE SCORE
          </div>
        </motion.div>

        {/* Override Arrow / Shatter */}
        <motion.div
          className="z-20 text-[5vw] text-primary"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, type: "spring", delay: 1.5 }}
        >
          &lt;
        </motion.div>

        {/* Critical Issue Warning */}
        <motion.div
          className="relative flex flex-col items-center"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <motion.div 
            className="w-[30vw] h-[20vw] bg-destructive/10 border-[2px] border-destructive rounded-[2vw] flex flex-col items-center justify-center p-[2vw] relative overflow-hidden"
            initial={{ backgroundColor: "rgba(220, 38, 38, 0)" }}
            animate={{ backgroundColor: ["rgba(220, 38, 38, 0.1)", "rgba(220, 38, 38, 0.3)", "rgba(220, 38, 38, 0.1)"] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1.8 }}
          >
            {/* Warning Stripes */}
            <div className="absolute top-0 left-0 w-full h-[1vw] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,hsl(var(--destructive))_10px,hsl(var(--destructive))_20px)] opacity-50" />
            
            <motion.div 
              className="text-destructive font-mono text-[3vw] mb-[1vw]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 2 }}
            >
              ⚠️
            </motion.div>
            <div className="text-[3vw] font-display font-bold text-destructive text-center leading-tight">
              CRITICAL<br/>ISSUE
            </div>
            
            <div className="absolute bottom-0 left-0 w-full h-[1vw] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,hsl(var(--destructive))_10px,hsl(var(--destructive))_20px)] opacity-50" />
          </motion.div>
          <div className="mt-[2vw] font-mono text-[1.5vw] text-foreground">
            OVERRIDES EVERYTHING
          </div>
        </motion.div>

      </div>
      
      {/* Dramatic Flash Effect */}
      <motion.div 
        className="absolute inset-0 bg-destructive/20 pointer-events-none z-50 mix-blend-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.5, delay: 2, ease: "easeOut" }}
      />
    </motion.div>
  );
}
