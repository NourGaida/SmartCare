package com.smartcare.ownership;

import com.smartcare.persistence.DeviceOwnershipRepository;
import com.smartcare.persistence.Measurement;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.util.Date;
import java.util.List;
import java.util.logging.Logger;

@ApplicationScoped
public class DeviceOwnershipResolver implements OwnershipResolver {

    private static final Logger LOG = Logger.getLogger(DeviceOwnershipResolver.class.getName());

    private final DeviceOwnershipRepository repository;

    protected DeviceOwnershipResolver() {
        this.repository = null;
    }

    @Inject
    public DeviceOwnershipResolver(DeviceOwnershipRepository repository) {
        this.repository = repository;
    }

    @Override
    public OwnershipResolution resolve(Measurement measurement) {
        List<Document> matches = repository.findMatching(
                measurement.deviceId(), Date.from(measurement.acquiredAt()));
        if (matches.isEmpty()) {
            return OwnershipResolution.unowned();
        }
        if (matches.size() == 1) {
            return OwnershipResolution.owned(matches.get(0).getString("patientId"));
        }
        Document selected = matches.get(0);
        String patientId = selected.getString("patientId");
        LOG.warning("Ownership conflict for deviceId=" + measurement.deviceId()
                + ", acquiredAt=" + measurement.acquiredAt()
                + ", matches=" + matches.size()
                + ", selectedPatientId=" + patientId);
        return OwnershipResolution.conflict(patientId);
    }
}
