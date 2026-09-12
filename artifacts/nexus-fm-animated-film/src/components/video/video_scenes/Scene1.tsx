import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: '-10%', filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Tech Nodes */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <motion.div 
          className="absolute w-[80vw] h-[80vw] border-[1px] border-primary rounded-full"
          initial={{ scale: 0, rotate: 0 }}
          animate={{ scale: 1, rotate: 180 }}
          transition={{ duration: 4, ease: "easeOut" }}
        />
        <motion.div 
          className="absolute w-[60vw] h-[60vw] border-[1px] border-primary border-dashed rounded-full"
          initial={{ scale: 0, rotate: 0 }}
          animate={{ scale: 1, rotate: -90 }}
          transition={{ duration: 4, ease: "easeOut", delay: 0.2 }}
        />
      </div>

      <div className="relative w-full h-full flex items-center px-[8vw]">
        
        {/* Left Side: Copy */}
        <div className="w-1/2 flex flex-col justify-center">
          <motion.div
            className="font-mono text-[1.5vw] text-primary mb-[2vw]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            // ARCHITECTURE PRINCIPLE 01
          </motion.div>
          
          <div className="overflow-hidden">
            <motion.h2
              className="text-[6vw] font-display font-bold leading-[0.9] text-foreground"
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            >
              FACILITY
              <br />
              <span className="text-stroke-primary">FIRST.</span>
            </motion.h2>
          </div>
          
          <div className="overflow-hidden mt-[1vw]">
            <motion.h2
              className="text-[6vw] font-display font-bold leading-[0.9] text-muted-foreground"
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
            >
              ASSET
              <br />
              CENTRIC.
            </motion.h2>
          </div>
        </div>

        {/* Right Side: Visual Node Tree */}
        <div className="w-1/2 relative h-full flex items-center justify-center">
          <motion.div 
            className="relative w-[30vw] h-[30vw]"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, type: "spring", bounce: 0.4, delay: 0.8 }}
          >
            {/* Center Node (Facility) */}
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[12vw] h-[12vw] bg-secondary border-[2px] border-primary flex flex-col items-center justify-center rounded-[2vw] z-20 shadow-[0_0_50px_rgba(0,174,239,0.3)]"
              animate={{ boxShadow: ["0 0 20px rgba(0,174,239,0.2)", "0 0 60px rgba(0,174,239,0.6)", "0 0 20px rgba(0,174,239,0.2)"] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="font-mono text-primary text-[1.2vw]">HQ</div>
              <div className="font-display font-bold text-[1.8vw]">FACILITY</div>
            </motion.div>

            {/* Asset Nodes */}
            {[
              { angle: 0, label: 'HVAC' },
              { angle: 72, label: 'ELEV' },
              { angle: 144, label: 'FIRE' },
              { angle: 216, label: 'PLMB' },
              { angle: 288, label: 'ELEC' }
            ].map((node, i) => {
              const rad = (node.angle * Math.PI) / 180;
              const distance = 14; // vw
              const x = Math.cos(rad) * distance;
              const y = Math.sin(rad) * distance;

              return (
                <motion.div
                  key={i}
                  className="absolute top-1/2 left-1/2"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{ x: `${x}vw`, y: `${y}vw`, opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, type: "spring", bounce: 0.5, delay: 1.2 + (i * 0.1) }}
                >
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 w-[6vw] h-[6vw] bg-muted border-[1px] border-muted-foreground flex items-center justify-center rounded-full z-20">
                    <span className="font-mono text-[1vw] text-foreground">{node.label}</span>
                  </div>
                  {/* Connection Line */}
                  <svg className="absolute top-0 left-0 overflow-visible pointer-events-none z-10 w-0 h-0">
                    <motion.line
                      x1="0"
                      y1="0"
                      x2={`${-x}vw`}
                      y2={`${-y}vw`}
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1, delay: 1.5 + (i * 0.1) }}
                    />
                  </svg>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
