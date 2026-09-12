import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 0, x: '-100%' }}
      animate={{ opacity: 1, x: '0%' }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4vw_4vw] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_70%)] pointer-events-none" />

      <div className="relative w-full max-w-[80vw] flex justify-between items-center mt-[4vw]">
        
        {/* Left: AI Recommends */}
        <motion.div 
          className="w-[45%] flex flex-col items-center justify-center bg-secondary/30 border-[1px] border-primary/30 p-[4vw] rounded-[2vw] relative overflow-hidden backdrop-blur-md"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {/* AI Glow */}
          <motion.div 
            className="absolute top-0 right-0 w-[20vw] h-[20vw] bg-primary/20 blur-[60px] rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          
          <div className="text-[2vw] font-mono text-primary mb-[1vw] z-10">
            01. COPILOT
          </div>
          <div className="text-[4vw] font-display font-bold text-foreground text-center leading-[1.1] z-10">
            AI ONLY<br/>RECOMMENDS
          </div>
          <motion.div 
            className="mt-[2vw] bg-primary/10 border-[1px] border-primary px-[2vw] py-[1vw] rounded-full z-10"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 1 }}
          >
            <span className="font-mono text-[1.2vw] text-primary">HUMAN IN CONTROL</span>
          </motion.div>
        </motion.div>

        {/* Divider / Link */}
        <motion.div
          className="w-[10%] flex justify-center items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <div className="w-[10vw] h-[2px] bg-gradient-to-r from-primary to-muted-foreground relative">
            <motion.div 
              className="absolute top-1/2 left-0 w-[1vw] h-[1vw] bg-primary rounded-full -translate-y-1/2 shadow-[0_0_10px_#00AEEF]"
              animate={{ x: ["0vw", "10vw"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </motion.div>

        {/* Right: Audit Trails */}
        <motion.div 
          className="w-[45%] flex flex-col items-center justify-center bg-secondary/30 border-[1px] border-muted-foreground/30 p-[4vw] rounded-[2vw] relative overflow-hidden backdrop-blur-md"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          {/* Fingerprint / Trail BG */}
          <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDIwaDQwTTIwIDB2NDAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIvPjwvc3ZnPg==')] bg-center pointer-events-none" />

          <div className="text-[2vw] font-mono text-muted-foreground mb-[1vw] z-10">
            02. ACCOUNTABILITY
          </div>
          <div className="text-[4vw] font-display font-bold text-foreground text-center leading-[1.1] z-10">
            IMMUTABLE<br/>AUDIT TRAILS
          </div>

          {/* Audit Logs Animation */}
          <div className="w-full mt-[2vw] flex flex-col gap-[0.5vw] z-10">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="w-full h-[2vw] bg-muted/50 rounded-[0.5vw] flex items-center px-[1vw] gap-[1vw]"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.5 + (i * 0.2) }}
              >
                <div className="w-[4vw] h-[0.5vw] bg-primary/50 rounded-full" />
                <div className="w-[12vw] h-[0.5vw] bg-muted-foreground/30 rounded-full" />
                <div className="w-[6vw] h-[0.5vw] bg-muted-foreground/20 rounded-full ml-auto" />
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
