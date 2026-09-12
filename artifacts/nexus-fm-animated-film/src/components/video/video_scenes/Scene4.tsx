import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center bg-background"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: '0%' }}
      exit={{ opacity: 0, x: '100%', filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-[8vw] left-[8vw] font-mono text-[1.5vw] text-primary">
        // SYSTEM ARCHITECTURE
      </div>

      <div className="flex w-[80vw] justify-between items-center">
        
        {/* Left: Text */}
        <div className="w-[40%] flex flex-col">
          <div className="overflow-hidden">
            <motion.h2
              className="text-[5vw] font-display font-bold leading-[1.1] text-foreground"
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              BUSINESS<br/>
              LOGIC
            </motion.h2>
          </div>
          <motion.div
            className="w-[10vw] h-[0.5vw] bg-primary my-[2vw]"
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          />
          <div className="overflow-hidden">
            <motion.p
              className="font-mono text-[1.8vw] text-muted-foreground leading-snug"
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.8, delay: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              ISOLATED IN THE<br/>
              <span className="text-primary font-bold">SERVICE / DOMAIN LAYER</span>
            </motion.p>
          </div>
        </div>

        {/* Right: Architecture Stack 3D Isometric */}
        <div className="w-[50%] h-[40vw] relative perspective-[1000px] flex items-center justify-center">
          <motion.div
            className="relative w-[30vw] h-[30vw]"
            initial={{ rotateX: 60, rotateZ: -45, y: 100, opacity: 0 }}
            animate={{ rotateX: 60, rotateZ: -45, y: 0, opacity: 1 }}
            transition={{ duration: 1.5, type: "spring", bounce: 0.3, delay: 0.5 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Presentation Layer */}
            <motion.div
              className="absolute inset-0 bg-secondary/80 border-[2px] border-muted rounded-[2vw] flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              initial={{ translateZ: 0 }}
              animate={{ translateZ: 150 }}
              transition={{ duration: 1, delay: 1.2, ease: "easeOut" }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="font-mono text-[2vw] text-muted-foreground -rotate-z-0">PRESENTATION</div>
            </motion.div>

            {/* Service/Domain Layer (The Highlight) */}
            <motion.div
              className="absolute inset-0 bg-primary/20 border-[4px] border-primary rounded-[2vw] flex flex-col items-center justify-center shadow-[0_0_50px_rgba(0,174,239,0.4)] backdrop-blur-sm"
              initial={{ translateZ: 0 }}
              animate={{ translateZ: 75 }}
              transition={{ duration: 1, delay: 1.4, ease: "easeOut" }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <motion.div 
                className="absolute inset-0 bg-primary/30 rounded-[2vw]"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="font-mono text-[2vw] text-primary font-bold z-10">DOMAIN / SERVICE</div>
              <motion.div 
                className="flex gap-[1vw] mt-[2vw] z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.5 }}
              >
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-[1.5vw] h-[1.5vw] bg-primary rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </motion.div>
            </motion.div>

            {/* Data Layer */}
            <motion.div
              className="absolute inset-0 bg-secondary border-[2px] border-muted rounded-[2vw] flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
              initial={{ translateZ: 0 }}
              animate={{ translateZ: 0 }}
              transition={{ duration: 1, delay: 1.6, ease: "easeOut" }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="font-mono text-[2vw] text-muted-foreground">DATA / INFRA</div>
            </motion.div>
            
            {/* Connecting Lines */}
            <motion.div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5 }}
              style={{ transformStyle: 'preserve-3d', translateZ: 75 }}
            >
              <div className="w-[2px] h-[150px] bg-primary/50 absolute" style={{ transform: 'rotateX(90deg) translateZ(0px)' }} />
            </motion.div>

          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}
