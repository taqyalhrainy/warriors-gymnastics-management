const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');
const Program = require('../models/Program');
const TrainingGroup = require('../models/TrainingGroup');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Subscription = require('../models/Subscription');
const { encrypt } = require('../utils/encryption');

const normalizeGroupName = (value) => String(value || '')
  .replace(/&amp;amp;#x2F;/g, '/')
  .replace(/&amp;#x2F;/g, '/')
  .replace(/&#x2F;/g, '/')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

dotenv.config();

const seed = async () => {
  try {
    await connectDB();

    const existingAdmin = await User.findOne({ email: 'admin@warriorsgym.com' });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('Admin@12345', 12);
      await User.create({ name: 'Warriors Admin', email: 'admin@warriorsgym.com', passwordHash, role: 'admin', phone: '', isActive: true });
      console.log('Created default admin user. Email: admin@warriorsgym.com Password: Admin@12345');
    }

    const programs = [
      { name: 'Beginner Program', description: 'Foundation gymnastics for new athletes', level: 'Beginner', price: 120 },
      { name: 'Intermediate Program', description: 'Skill advancement and discipline', level: 'Intermediate', price: 140 },
      { name: 'Advanced Program', description: 'Competitive training for experienced gymnasts', level: 'Advanced', price: 160 }
    ];
    for (const program of programs) {
      const exists = await Program.findOne({ name: program.name });
      if (!exists) {
        await Program.create(program);
      }
    }

    const groupColors = ['#2563eb', '#f2c94c', '#16a34a', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
    const groups = [
      { name: 'Saturday / Wednesday 4:00 PM - 5:00 PM', days: ['Saturday', 'Wednesday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
      { name: 'Saturday / Wednesday 5:00 PM - 6:30 PM', days: ['Saturday', 'Wednesday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
      { name: 'Saturday / Wednesday 6:30 PM - 8:00 PM', days: ['Saturday', 'Wednesday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 },
      { name: 'Sunday / Tuesday 4:00 PM - 5:00 PM', days: ['Sunday', 'Tuesday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
      { name: 'Sunday / Tuesday 5:00 PM - 6:30 PM', days: ['Sunday', 'Tuesday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
      { name: 'Sunday / Tuesday 6:30 PM - 8:00 PM', days: ['Sunday', 'Tuesday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 },
      { name: 'Monday / Thursday 4:00 PM - 5:00 PM', days: ['Monday', 'Thursday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
      { name: 'Monday / Thursday 5:00 PM - 6:30 PM', days: ['Monday', 'Thursday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
      { name: 'Monday / Thursday 6:30 PM - 8:00 PM', days: ['Monday', 'Thursday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 }
    ];
    const existingGroups = await TrainingGroup.find().lean();
    for (const [index, group] of groups.entries()) {
      const exists = existingGroups.find((existingGroup) => normalizeGroupName(existingGroup.name) === group.name);
      if (!exists) {
        await TrainingGroup.create({ ...group, color: groupColors[index], displayOrder: index + 1 });
      }
    }

    const testParentEmail = 'parent@test.com';
    let parentUser = await User.findOne({ email: testParentEmail });
    if (!parentUser) {
      const passwordHash = await bcrypt.hash('Parent@12345', 12);
      parentUser = await User.create({ name: 'Test Parent', email: testParentEmail, passwordHash, role: 'parent', phone: '0123456789', isActive: true });
      console.log('Created default test parent user. Email: parent@test.com Password: Parent@12345');
    }

    let parentRecord = await Parent.findOne({ userId: parentUser._id });
    if (!parentRecord) {
      parentRecord = await Parent.create({ userId: parentUser._id, name: parentUser.name, email: parentUser.email, phoneEncrypted: encrypt('0123456789'), children: [] });
    }

    const program = await Program.findOne({ name: 'Beginner Program' });
    const group = await TrainingGroup.findOne({ name: 'Saturday / Wednesday 4:00 PM - 5:00 PM' });

    if (program && group) {
      let player = await Player.findOne({ fullName: 'Test Player', parentId: parentRecord._id });
      if (!player) {
        player = await Player.create({
          fullName: 'Test Player',
          dateOfBirth: new Date('2015-05-15'),
          parentId: parentRecord._id,
          parentPhoneEncrypted: encrypt('0123456789'),
          programId: program._id,
          groupId: group._id,
          level: 'Beginner',
          status: 'active',
          profileImage: ''
        });
        parentRecord.children.push(player._id);
        await parentRecord.save();
        group.currentCount = Math.min(group.maxCapacity, group.currentCount + 1);
        await group.save();
      }

      const existingSubscription = await Subscription.findOne({ playerId: player._id });
      if (!existingSubscription) {
        await Subscription.create({
          playerId: player._id,
          type: 'sessions',
          packageName: 'Starter Sessions',
          totalSessions: 10,
          usedSessions: 0,
          remainingSessions: 10,
          startDate: new Date(),
          endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
          price: 250,
          status: 'active'
        });
      }
    }

    console.log('Seed completed.');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seed();
