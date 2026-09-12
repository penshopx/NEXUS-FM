import { motion } from 'framer-motion';

export function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(30px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-[5vw] left-1/2 -translate-x-1/2 flex flex-col items-center">
        <motion.div
          className="bg-primary/20 text-primary font-mono text-[1.5vw] px-[2vw] py-[0.5vw] rounded-full border border-primary/50 mb-[1vw]"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          FOUNDATION & AUTHENTICATION
        </motion.div>
        <motion.h2
          className="text-[4vw] font-display font-bold text-foreground text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          STABLE, VERIFIED, LOCKED.
        </motion.h2>
      </div>

      {/* Main Security Shield / Matrix */}
      <div className="relative w-[80vw] h-[35vw] mt-[10vw] flex items-center justify-between">
        
        {/* Shield / Core */}
        <motion.div 
          className="w-[30%] h-full relative flex items-center justify-center"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <motion.div 
            className="w-[20vw] h-[25vw] bg-secondary/80 border-[2px] border-primary rounded-[2vw] flex flex-col items-center justify-center overflow-hidden"
            animate={{ boxShadow: ["0 0 20px rgba(0,174,239,0.2)", "0 0 60px rgba(0,174,239,0.5)", "0 0 20px rgba(0,174,239,0.2)"] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwMEFFRUYiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9zdmc+')] mix-blend-overlay" />
            
            <motion.div 
              className="text-[6vw] mb-[2vw]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 1 }}
            >
              🛡️
            </motion.div>
            <div className="font-mono text-primary text-[1.5vw] text-center px-[2vw]">
              SERVER<br/>ENFORCED
            </div>
            
            {/* Scan line */}
            <motion.div 
              className="absolute left-0 right-0 h-[2px] bg-primary shadow-[0_0_10px_#00AEEF]"
              animate={{ top: ["0%", "100%", "0%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        </motion.div>

        {/* Specs List */}
        <div className="w-[65%] h-full flex flex-col justify-center gap-[2vw]">
          {[
            { title: "7 CANONICAL ROLES", desc: "No custom role sprawl. Predictable matrix." },
            { title: "RESOURCE.ACTION", desc: "Standardized permission format." },
            { title: "DENY-BY-DEFAULT", desc: "Explicit grants only. Zero implicit access." },
            { title: "PLATFORM_ADMIN", desc: "System config only. NOT an operational superuser." }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="flex flex-col border-l-[4px] border-primary pl-[2vw]"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 1.2 + (i * 0.2) }}
            >
              <div className="font-display font-bold text-[2.5vw] text-foreground leading-tight">
                {item.title}
              </div>
              <div className="font-mono text-[1.5vw] text-muted-foreground mt-[0.5vw]">
                {item.desc}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </motion.div>
  );
}
