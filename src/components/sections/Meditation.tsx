"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import { Play, Pause, Wind, Moon, Sun, Sparkles } from "lucide-react";
import { useState } from "react";

gsap.registerPlugin(ScrollTrigger);

const meditations = [
  {
    title: "Ocean Breathing",
    duration: "5 min",
    icon: Wind,
    description: "Sync your breath with the rhythm of the waves for deep relaxation.",
    color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    title: "Night Watch Calm",
    duration: "10 min",
    icon: Moon,
    description: "Find peace during irregular hours and night shifts at sea.",
    color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    title: "Morning Deck Reset",
    duration: "7 min",
    icon: Sun,
    description: "Start your day with clarity and positive intention.",
    color: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    gradient: "from-amber-500 to-orange-500",
  },
  {
    title: "Inner Compass",
    duration: "15 min",
    icon: Sparkles,
    description: "Guided visualization to reconnect with your purpose and direction.",
    color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    gradient: "from-emerald-500 to-teal-500",
  },
];

function MeditationCard({
  item,
  index,
}: {
  item: (typeof meditations)[0];
  index: number;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="group relative p-6 rounded-3xl bg-slate-900/40 border border-slate-800/50 hover:border-slate-600/50 transition-all duration-500"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.color}`}>
          <item.icon className="w-6 h-6" />
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
          {item.duration}
        </span>
      </div>

      <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed mb-6">{item.description}</p>

      <button
        onClick={() => setPlaying(!playing)}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r ${item.gradient} text-white font-medium hover:shadow-lg transition-all hover:scale-[1.02]`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        {playing ? "Playing..." : "Start Session"}
      </button>
    </motion.div>
  );
}

export default function Meditation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(visualRef.current, {
        rotateZ: 360,
        duration: 120,
        repeat: -1,
        ease: "none",
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="meditation"
      ref={sectionRef}
      className="relative py-32 bg-slate-950 overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block px-4 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-6 border border-cyan-500/20">
              Guided Practice
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
              Meditations for{" "}
              <span className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Maritime Life
              </span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Audio-guided sessions designed specifically for the unique rhythms of yacht life.
              From night watch anxiety to morning clarity, find your calm.
            </p>

            <div ref={visualRef} className="relative w-72 h-72 mx-auto lg:mx-0">
              <div className="absolute inset-0 rounded-full border border-cyan-500/10" />
              <div className="absolute inset-4 rounded-full border border-cyan-500/10" />
              <div className="absolute inset-8 rounded-full border border-cyan-500/10" />
              <div className="absolute inset-12 rounded-full border border-cyan-500/10" />
              <div className="absolute inset-16 rounded-full border border-cyan-500/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center animate-pulse">
                  <Wind className="w-8 h-8 text-cyan-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {meditations.map((item, index) => (
              <MeditationCard key={item.title} item={item} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
