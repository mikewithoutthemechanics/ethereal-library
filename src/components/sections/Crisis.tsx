"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import {
  Phone,
  MessageSquare,
  Globe,
  AlertTriangle,
  Clock,
  Shield,
  HeartHandshake,
  Radio,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const channels = [
  {
    icon: Phone,
    title: "Emergency Hotline",
    detail: "+1 (800) SEA-HELP",
    desc: "24/7 immediate crisis intervention with maritime-trained counselors.",
    color: "from-rose-500 to-pink-600",
    urgent: true,
  },
  {
    icon: MessageSquare,
    title: "Live Chat",
    detail: "Available Now",
    desc: "Discreet text-based support for when you cannot make a call.",
    color: "from-cyan-500 to-blue-600",
    urgent: false,
  },
  {
    icon: Globe,
    title: "Global Network",
    detail: "150+ Ports",
    desc: "Local referrals and in-person support at major yachting hubs worldwide.",
    color: "from-emerald-500 to-teal-600",
    urgent: false,
  },
];

export default function Crisis() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".crisis-card",
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
          },
        }
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="crisis"
      ref={sectionRef}
      className="relative py-32 bg-slate-950 overflow-hidden"
    >
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-rose-500/5 blur-[150px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium mb-6"
            >
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Always Available</span>
            </motion.div>

            <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
              Crisis{" "}
              <span className="font-semibold bg-gradient-to-r from-rose-400 to-orange-500 bg-clip-text text-transparent">
                Support
              </span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Mental health emergencies do not wait for port. Our crisis team understands 
              the isolation of being at sea and is trained for maritime-specific situations.
            </p>

            <div className="flex flex-wrap gap-4 mb-8">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>24/7 Response</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>100% Confidential</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <HeartHandshake className="w-4 h-4 text-cyan-400" />
                <span>Maritime Trained</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {channels.map((channel) => (
              <div
                key={channel.title}
                className={`crisis-card group relative p-6 rounded-2xl bg-slate-900/50 border ${
                  channel.urgent ? "border-rose-500/30" : "border-slate-800/50"
                } hover:border-cyan-500/30 transition-all duration-500`}
              >
                {channel.urgent && (
                  <div className="absolute -top-3 right-6 flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500 text-white text-xs font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    URGENT
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${channel.color} flex items-center justify-center shrink-0`}
                  >
                    <channel.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-white font-semibold">{channel.title}</h3>
                      <span
                        className={`text-xs font-medium ${
                          channel.urgent ? "text-rose-400" : "text-cyan-400"
                        }`}
                      >
                        {channel.detail}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {channel.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              viewport={{ once: true }}
              className="p-6 rounded-2xl bg-gradient-to-r from-rose-500/10 to-orange-500/10 border border-rose-500/20"
            >
              <p className="text-slate-300 text-sm leading-relaxed">
                <span className="text-rose-400 font-semibold">Immediate danger?</span>{" "}
                If you or someone you know is in immediate danger, contact your captain, 
                local emergency services, or the nearest coast guard. We are here to support 
                alongside these services.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
