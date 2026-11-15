package com.smartcare.ingestion;

import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.SaveResult;

public interface MeasurementStore {

    SaveResult save(Measurement measurement);
}
