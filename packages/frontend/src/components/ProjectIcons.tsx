
import React from 'react';
import {
  Server, Cloud, Database, HardDrive, Network, Cpu, Globe, Wifi, Radio, Signal, Router,
  Monitor, Laptop, Smartphone, Tablet, Watch, Printer, Camera, Speaker, Mouse, Keyboard,
  Terminal, Code, GitBranch, GitCommit, GitMerge, Box, Package, Layers, Command, Braces, Bug, Binary,
  Folder, File, FileText, FileCode, Archive, Clipboard, Briefcase, Building, Home, Paperclip, Calendar,
  Lock, Key, Shield, ShieldCheck, ShieldAlert, Unlock, Eye, EyeOff, Fingerprint,
  Activity, Zap, Battery, Sun, Moon, Star, Heart, Flag, Bookmark, Rocket, Flame, Droplet, Snowflake, Wind,
  MessageSquare, MessageCircle, Mail, Phone, Send, Share, Bell, AtSign, Mic,
  Settings, Sliders, Wrench, Hammer, PenTool, Scissors, Trash, Edit, Search, Filter, Gauge,
  BarChart, PieChart, LineChart, TrendingUp, TrendingDown, ActivitySquare, Target,
  User, Users, UserCog, Crown, Award, UserCheck, UserPlus, Smile,
  Anchor, Coffee, Gift, Map, MapPin, Navigation, Compass, LifeBuoy, Umbrella, Truck, ShoppingCart, 
  CreditCard, DollarSign, Music, Video, Image, Link, ExternalLink, CheckCircle, AlertTriangle, 
  Info, HelpCircle, MousePointer, Hash, List, Grid
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  'server': Server, 'cloud': Cloud, 'database': Database, 'hard-drive': HardDrive, 'network': Network, 
  'router': Router, 'cpu': Cpu, 'globe': Globe, 'wifi': Wifi, 'radio': Radio, 'signal': Signal,
  'monitor': Monitor, 'laptop': Laptop, 'smartphone': Smartphone, 'tablet': Tablet, 'watch': Watch, 
  'printer': Printer, 'camera': Camera, 'speaker': Speaker, 'mouse': Mouse, 'keyboard': Keyboard,
  'terminal': Terminal, 'code': Code, 'git-branch': GitBranch, 'git-commit': GitCommit, 'git-merge': GitMerge, 
  'box': Box, 'package': Package, 'layers': Layers, 'command': Command, 'braces': Braces, 'bug': Bug, 'binary': Binary,
  'folder': Folder, 'file': File, 'file-text': FileText, 'file-code': FileCode, 'archive': Archive, 
  'clipboard': Clipboard, 'briefcase': Briefcase, 'building': Building, 'home': Home, 'paperclip': Paperclip, 'calendar': Calendar,
  'lock': Lock, 'key': Key, 'shield': Shield, 'shield-check': ShieldCheck, 'shield-alert': ShieldAlert, 
  'unlock': Unlock, 'eye': Eye, 'eye-off': EyeOff, 'fingerprint': Fingerprint,
  'activity': Activity, 'zap': Zap, 'battery': Battery, 'sun': Sun, 'moon': Moon, 'star': Star, 
  'heart': Heart, 'flag': Flag, 'bookmark': Bookmark, 'rocket': Rocket, 'flame': Flame, 
  'droplet': Droplet, 'snowflake': Snowflake, 'wind': Wind,
  'message-square': MessageSquare, 'message-circle': MessageCircle, 'mail': Mail, 'phone': Phone, 
  'send': Send, 'share': Share, 'bell': Bell, 'at-sign': AtSign, 'mic': Mic,
  'settings': Settings, 'sliders': Sliders, 'wrench': Wrench, 'hammer': Hammer, 'pen-tool': PenTool, 
  'scissors': Scissors, 'trash': Trash, 'edit': Edit, 'search': Search, 'filter': Filter, 'gauge': Gauge,
  'bar-chart': BarChart, 'pie-chart': PieChart, 'line-chart': LineChart, 'trending-up': TrendingUp, 
  'trending-down': TrendingDown, 'activity-square': ActivitySquare, 'target': Target,
  'user': User, 'users': Users, 'user-cog': UserCog, 'crown': Crown, 'award': Award, 
  'user-check': UserCheck, 'user-plus': UserPlus, 'smile': Smile,
  'anchor': Anchor, 'coffee': Coffee, 'gift': Gift, 'map': Map, 'map-pin': MapPin, 
  'navigation': Navigation, 'compass': Compass, 'life-buoy': LifeBuoy, 'umbrella': Umbrella, 
  'truck': Truck, 'shopping-cart': ShoppingCart, 'credit-card': CreditCard, 'dollar-sign': DollarSign, 
  'music': Music, 'video': Video, 'image': Image, 'link': Link, 'external-link': ExternalLink, 
  'check-circle': CheckCircle, 'alert-triangle': AlertTriangle, 'info': Info, 'help-circle': HelpCircle, 
  'mouse-pointer': MousePointer, 'hash': Hash, 'list': List, 'grid': Grid
};

export const ALL_ICONS = Object.keys(ICON_MAP);

interface ProjectIconProps {
  name: string;
  className?: string;
  size?: number;
}

export const ProjectIcon: React.FC<ProjectIconProps> = ({ name, className = '', size = 20 }) => {
  const IconComponent = ICON_MAP[name] || Folder; 
  return <IconComponent size={size} className={className} />;
};
