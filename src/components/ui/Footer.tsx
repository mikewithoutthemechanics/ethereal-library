"use client";

import { Anchor, Heart, Mail, Phone } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800/50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600">
                <Anchor className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-light text-white">
                Ethereal<span className="font-semibold text-cyan-400">Library</span>
              </span>
            </div>
            <p className="text-slate-400 max-w-md leading-relaxed">
              Dedicated mental health and psychology support for yacht crew members worldwide. 
              Because wellbeing at sea begins with care on shore.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Resources</h4>
            <ul className="space-y-3 text-slate-400">
              <li><a href="#" className="hover:text-cyan-400 transition-colors">Therapy Sessions</a></li>
              <li><a href="#" className="hover:text-cyan-400 transition-colors">Guided Meditation</a></li>
              <li><a href="#" className="hover:text-cyan-400 transition-colors">Crisis Hotline</a></li>
              <li><a href="#" className="hover:text-cyan-400 transition-colors">Self-Help Library</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" />
                <span>support@ethereallibrary.com</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-cyan-400" />
                <span>+1 (800) SEA-HELP</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">
            &copy; 2026 Ethereal Library. All rights reserved.
          </p>
          <p className="text-slate-500 text-sm flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-rose-500 fill-rose-500" /> for seafarers
          </p>
        </div>
      </div>
    </footer>
  );
}
