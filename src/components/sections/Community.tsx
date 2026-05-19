"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import { MessageCircle, Star, MapPin, Anchor } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  {
    name: "Sarah M.",
    role: "Chief Stewardess",
    location: "Mediterranean",
    text: "After a difficult season, the therapy sessions here gave me tools I actually use onboard. The maritime-specific approach makes all the difference.",
    rating: 5,
  },
  {
    name: "James K.",
    role: "First Officer",
    location: "Caribbean",
    text: "The night shift meditation has been a game changer. I finally sleep well between watches. Highly recommend for anyone on rotation.",
    rating: 5,
  },
  {
    name: "Elena R.",
    role: "Chef",
    location: "South Pacific",
    text: "Being away from family for months is hard. The relationship counseling helped me and my partner stay connected across oceans.",
    rating: 5,
  },
];

const stats = [
  { value: "2,400+", label: "Crew Members Helped" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "24/7", label: "Crisis Support" },
  { value: "15+", label: "Licensed Therapists" },
];

export default function Community() {
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".stat-number",
        { opacity: 0, scale: 0.5 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.8,
          stagger: 0.15,
          ease: "back.out(1.7)",
          scrollTrigger: {
            trigger: statsRef.current,
            start: "top 80%",
          },
        }
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <section id="community" className="relative py-32 bg-slate-950 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/10 via-slate-950 to-slate-950" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-20">
          <span className="inline-block px-4 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-6 border border-cyan-500/20">
            Community
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
            Voices from the{" "}
            <span className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Fleet
            </span>
          </h2>
        </div>

        <div
          ref={statsRef}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-24"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="stat-number text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
                {stat.value}
              </div>
              <div className="text-slate-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              viewport={{ once: true }}
              className="relative p-8 rounded-3xl bg-slate-900/40 border border-slate-800/50 hover:border-cyan-500/20 transition-all duration-500"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>

              <p className="text-slate-300 leading-relaxed mb-6">&ldquo;{t.text}&rdquo;</p>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-white font-medium">{t.name}</div>
                  <div className="text-slate-500 text-sm">{t.role}</div>
                </div>
                <div className="ml-auto flex items-center gap-1 text-slate-600 text-xs">
                  <MapPin className="w-3 h-3" />
                  {t.location}
                </div>
              </div>

              <MessageCircle className="absolute top-6 right-6 w-8 h-8 text-slate-800" />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mt-20 text-center"
        >
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-full bg-slate-900/50 border border-slate-800">
            <Anchor className="w-5 h-5 text-cyan-400" />
            <span className="text-slate-300">
              Join <span className="text-white font-semibold">2,400+</span> crew members prioritizing their mental health
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
