"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Brain,
  Heart,
  Users,
  Compass,
  Sun,
  Shield,
  ArrowRight,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const services = [
  {
    icon: Brain,
    title: "Individual Therapy",
    description:
      "One-on-one sessions with licensed maritime psychologists who understand the isolation, stress, and unique pressures of yacht crew life.",
    color: "from-cyan-500 to-blue-600",
    shadow: "shadow-cyan-500/20",
  },
  {
    icon: Users,
    title: "Crew Counseling",
    description:
      "Group sessions to build team cohesion, resolve interpersonal conflicts, and create a supportive onboard environment.",
    color: "from-emerald-500 to-teal-600",
    shadow: "shadow-emerald-500/20",
  },
  {
    icon: Compass,
    title: "Career Navigation",
    description:
      "Guidance for career transitions, burnout recovery, and finding balance between demanding rotations and personal life.",
    color: "from-violet-500 to-purple-600",
    shadow: "shadow-violet-500/20",
  },
  {
    icon: Sun,
    title: "Wellness Programs",
    description:
      "Holistic wellness plans including sleep optimization, nutrition for shift workers, and exercise routines for confined spaces.",
    color: "from-amber-500 to-orange-600",
    shadow: "shadow-amber-500/20",
  },
  {
    icon: Shield,
    title: "Trauma Support",
    description:
      "Specialized care for PTSD, accidents at sea, and critical incident stress management with 24/7 availability.",
    color: "from-rose-500 to-pink-600",
    shadow: "shadow-rose-500/20",
  },
  {
    icon: Heart,
    title: "Relationship Care",
    description:
      "Support for maintaining relationships across distances, family dynamics, and social connection while on rotation.",
    color: "from-sky-500 to-cyan-600",
    shadow: "shadow-sky-500/20",
  },
];

export default function Services() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".services-header",
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
          },
        }
      );

      const cards = cardsRef.current?.children;
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 60, rotateX: 15 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: {
              trigger: cardsRef.current,
              start: "top 80%",
            },
          }
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative py-32 bg-slate-950 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="services-header text-center mb-20">
          <span className="inline-block px-4 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-6 border border-cyan-500/20">
            Our Services
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-6">
            Tailored for{" "}
            <span className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Life at Sea
            </span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Every service is designed with an understanding of the yachting industry,
            from seasonal contracts to the unique social dynamics onboard.
          </p>
        </div>

        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          style={{ perspective: "1000px" }}
        >
          {services.map((service) => (
            <div
              key={service.title}
              className="group relative p-8 rounded-3xl bg-slate-900/50 border border-slate-800/50 hover:border-slate-700 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/5"
            >
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ${service.shadow}`}
              >
                <service.icon className="w-7 h-7 text-white" />
              </div>

              <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-cyan-400 transition-colors">
                {service.title}
              </h3>
              <p className="text-slate-400 leading-relaxed mb-6">
                {service.description}
              </p>

              <a
                href="#"
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Learn more
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>

              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
