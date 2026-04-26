#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import asyncio
from app.seed.seed_data import main
asyncio.run(main())
