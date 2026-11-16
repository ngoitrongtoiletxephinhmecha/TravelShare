import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import * as path from 'path';
import { ActivityType } from '../common/enums/system.enums';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export interface ActivityMigrationSummary {
  dryRun: boolean;
  aiConversationsUpdated: number;
  travelPlansUpdated: number;
  gearRulesUpdated: number;
  communitiesUpdated: number;
  postsUpdated: number;
  details: string[];
}

/**
 * Normalizes legacy `BEACH_CAMPING` records to `CAMPING` while preserving
 * coastal context (`environment: 'COASTAL'`) and existing gear quantities/edits.
 * Can be run safely in preview mode (`--dry-run`) or live mode (`--apply`).
 */
export async function migrateLegacyBeachCampingData(
  db: mongoose.mongo.Db,
  options: { dryRun?: boolean } = {},
): Promise<ActivityMigrationSummary> {
  const dryRun = options.dryRun !== false;
  const details: string[] = [];

  const convCol = db.collection('ai_conversations');
  const convDocs = await convCol
    .find({
      $or: [
        { 'tripState.activity': 'BEACH_CAMPING' },
        { 'parsedRequirements.activity': 'BEACH_CAMPING' },
      ],
    })
    .toArray();

  let aiConversationsUpdated = 0;
  for (const conv of convDocs) {
    const tripState = { ...(conv.tripState || {}) };
    const parsedRequirements = { ...(conv.parsedRequirements || {}) };
    let changed = false;

    if (tripState.activity === 'BEACH_CAMPING') {
      tripState.activity = ActivityType.CAMPING;
      tripState.environment = tripState.environment || 'COASTAL';
      changed = true;
    }
    if (parsedRequirements.activity === 'BEACH_CAMPING') {
      parsedRequirements.activity = ActivityType.CAMPING;
      parsedRequirements.environment = parsedRequirements.environment || 'COASTAL';
      changed = true;
    }

    if (changed) {
      aiConversationsUpdated += 1;
      details.push(`ai_conversations:${String(conv._id)} -> CAMPING (COASTAL)`);
      if (!dryRun) {
        await convCol.updateOne(
          { _id: conv._id },
          { $set: { tripState, parsedRequirements } },
        );
      }
    }
  }

  const planCol = db.collection('travel_plans');
  const planDocs = await planCol.find({ activity: 'BEACH_CAMPING' }).toArray();
  let travelPlansUpdated = 0;
  for (const plan of planDocs) {
    travelPlansUpdated += 1;
    details.push(`travel_plans:${String(plan._id)} -> CAMPING (COASTAL)`);
    if (!dryRun) {
      await planCol.updateOne(
        { _id: plan._id },
        {
          $set: {
            activity: ActivityType.CAMPING,
            environment: plan.environment || 'COASTAL',
          },
        },
      );
    }
  }

  const ruleCol = db.collection('gear_rules');
  const legacyRules = await ruleCol.find({ activity: 'BEACH_CAMPING' }).toArray();
  let gearRulesUpdated = 0;
  for (const rule of legacyRules) {
    const existsInCamping = await ruleCol.findOne({
      activity: ActivityType.CAMPING,
      categoryCode: rule.categoryCode,
    });
    gearRulesUpdated += 1;
    if (existsInCamping) {
      details.push(
        `gear_rules:${String(rule._id)} (${rule.categoryCode}) merged/removed duplicate under CAMPING`,
      );
      if (!dryRun) {
        await ruleCol.deleteOne({ _id: rule._id });
      }
    } else {
      details.push(
        `gear_rules:${String(rule._id)} (${rule.categoryCode}) -> CAMPING`,
      );
      if (!dryRun) {
        await ruleCol.updateOne(
          { _id: rule._id },
          { $set: { activity: ActivityType.CAMPING } },
        );
      }
    }
  }

  const commCol = db.collection('communities');
  const commDocs = await commCol.find({ activityType: 'BEACH_CAMPING' }).toArray();
  let communitiesUpdated = 0;
  for (const comm of commDocs) {
    communitiesUpdated += 1;
    details.push(`communities:${String(comm._id)} -> CAMPING`);
    if (!dryRun) {
      await commCol.updateOne(
        { _id: comm._id },
        { $set: { activityType: ActivityType.CAMPING } },
      );
    }
  }

  const postCol = db.collection('posts');
  const postDocs = await postCol.find({ activityType: 'BEACH_CAMPING' }).toArray();
  let postsUpdated = 0;
  for (const post of postDocs) {
    postsUpdated += 1;
    details.push(`posts:${String(post._id)} -> CAMPING`);
    if (!dryRun) {
      await postCol.updateOne(
        { _id: post._id },
        { $set: { activityType: ActivityType.CAMPING } },
      );
    }
  }

  return {
    dryRun,
    aiConversationsUpdated,
    travelPlansUpdated,
    gearRulesUpdated,
    communitiesUpdated,
    postsUpdated,
    details,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply || args.includes('--dry-run');
  const mongoUri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/travelshare';

  await mongoose.connect(mongoUri);
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB connection db handle is unavailable');
    }
    const summary = await migrateLegacyBeachCampingData(db, { dryRun });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('ActivityType migration failed:', err);
    process.exit(1);
  });
}
